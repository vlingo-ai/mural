import { randomUUID } from 'node:crypto';
import { transaction, type Database } from './db.js';
import { ServiceError } from './errors.js';
import {
  HOSTED_HELPER_RATE_VERSION,
  hostedHelperBody,
  hostedHelperCost,
  hostedOutput,
  observedHostedResponse,
  parseHostedHelperInput,
  type HostedHelperInput,
  type HostedHelperResult,
  type HostedResponsesRequest,
  type HostedResponsesTransport,
  type ObservedHostedResponse,
} from './hosted-helpers.js';
import { lockPaidWallet, reservePaidInTransaction, settlePaidInTransaction } from './ledger.js';

export interface AccountModelTaskConfig {
  maxRequestsPerMinute: number;
  maxConcurrentPerAccount: number;
  maxConcurrentGlobal: number;
  inputFramingTokenAllowance: number;
  searchInputTokenAllowance: number;
  timeoutMilliseconds: number;
}

const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

function validateConfig(config: AccountModelTaskConfig): void {
  if (!integer(config.maxRequestsPerMinute, 1, 10) || !integer(config.maxConcurrentPerAccount, 1, 2) ||
      !integer(config.maxConcurrentGlobal, 1, 20) || !integer(config.inputFramingTokenAllowance, 4096, 65_536) ||
      !integer(config.searchInputTokenAllowance, 1_050_000, 4_200_000) ||
      !integer(config.timeoutMilliseconds, 50, 60_000))
    throw new ServiceError('invalid_account_model_task_configuration', 503);
}

/**
 * One-shot, member-funded model work outside a Live session. The durable rows contain only
 * billing metadata and trusted usage counters; prompts, queries and model output remain transient.
 */
export class AccountModelTasks {
  readonly #config: Readonly<AccountModelTaskConfig>;

  constructor(
    private readonly db: Database,
    private readonly transport: HostedResponsesTransport,
    config: AccountModelTaskConfig,
  ) {
    validateConfig(config);
    this.#config = Object.freeze({ ...config });
  }

  async request(account: string, body: unknown): Promise<HostedHelperResult> {
    const input = parseHostedHelperInput(body);
    if (input.purpose !== 'topic' || input.search !== true || input.schema !== undefined)
      throw new ServiceError('account_model_task_not_allowed', 409);
    const providerBody = hostedHelperBody(input);
    const reservation = await this.#reserve(account, input, providerBody);
    const controller = new AbortController();
    let timeout: NodeJS.Timeout | undefined;
    let raw: unknown;
    try {
      if (Date.now() >= reservation.activeUntil.getTime()) throw new Error('Reserved request deadline passed.');
      raw = await Promise.race([
        this.transport.send(providerBody, controller.signal, { requestID: input.requestID, purpose: input.purpose }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error('Provider deadline exceeded.'));
          }, Math.min(this.#config.timeoutMilliseconds, reservation.activeUntil.getTime() - Date.now()));
        }),
      ]);
    } catch {
      await this.#uncertain(input.requestID);
      throw new ServiceError('model_task_response_uncertain', 502);
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    let observed: ObservedHostedResponse;
    try { observed = observedHostedResponse(raw); }
    catch {
      await this.#uncertain(input.requestID);
      throw new ServiceError('model_task_response_uncertain', 502);
    }
    const breached = observed.usage.inputTokens > reservation.inputTokenCeiling ||
      observed.usage.outputTokens > providerBody.max_output_tokens || observed.usage.searchCalls > 1;
    const charge = hostedHelperCost(observed.usage);
    let overrun: boolean;
    try { overrun = await this.#settle(account, input.requestID, observed, charge, breached); }
    catch {
      await this.#uncertain(input.requestID);
      throw new ServiceError('model_task_response_uncertain', 502);
    }
    if (overrun || breached) throw new ServiceError('model_task_provider_limit_exceeded', 503);
    const output = hostedOutput(raw);
    return { requestID: input.requestID, ...output, usage: observed.usage,
      costNanoUSD: charge.toString(), rateVersion: HOSTED_HELPER_RATE_VERSION };
  }

  async #reserve(account: string, input: HostedHelperInput, providerBody: HostedResponsesRequest) {
    return transaction(this.db, async sql => {
      await sql.query("SELECT pg_advisory_xact_lock(hashtext('mural-account-model-task-admission'))");
      await lockPaidWallet(sql, account);
      if ((await sql.query('SELECT request_id FROM account_model_tasks WHERE request_id=$1', [input.requestID])).rowCount)
        throw new ServiceError('model_task_already_attempted', 409);
      if ((await sql.query('SELECT request_id FROM account_model_tasks WHERE limit_breached LIMIT 1')).rowCount)
        throw new ServiceError('model_task_provider_reconciliation_required', 503);
      const recent = Number((await sql.query(`SELECT count(*) AS total FROM account_model_tasks
        WHERE account_id=$1 AND created_at>now()-interval '1 minute'`, [account])).rows[0].total);
      if (recent >= this.#config.maxRequestsPerMinute) throw new ServiceError('model_task_rate_limit', 429);
      const pending = (await sql.query(`SELECT
        count(*) FILTER(WHERE account_id=$1)::integer AS account_total,count(*)::integer AS global_total,now() AS database_now
        FROM account_model_tasks WHERE state<>'settled' AND active_until>now()`, [account])).rows[0];
      if (Number(pending.account_total) >= this.#config.maxConcurrentPerAccount ||
          Number(pending.global_total) >= this.#config.maxConcurrentGlobal)
        throw new ServiceError('model_task_concurrency_limit', 429);
      const inputTokenCeiling = Buffer.byteLength(JSON.stringify(providerBody)) +
        this.#config.inputFramingTokenAllowance + this.#config.searchInputTokenAllowance;
      const hold = hostedHelperCost({ inputTokens: inputTokenCeiling, cachedInputTokens: 0,
        cacheWriteTokens: inputTokenCeiling, outputTokens: providerBody.max_output_tokens, searchCalls: 1 });
      const reservationID = randomUUID();
      await reservePaidInTransaction(sql, account, reservationID, `account-model-task:${input.requestID}`,
        hold, HOSTED_HELPER_RATE_VERSION);
      const activeUntil = new Date(pending.database_now.getTime() + this.#config.timeoutMilliseconds + 5_000);
      await sql.query(`INSERT INTO account_model_tasks(request_id,account_id,purpose,search_requested,input_token_ceiling,
        output_token_ceiling,hold_nano,active_until,reservation_id) VALUES($1,$2,'topic',true,$3,$4,$5,$6,$7)`,
      [input.requestID, account, inputTokenCeiling, providerBody.max_output_tokens, hold.toString(), activeUntil, reservationID]);
      return { activeUntil, inputTokenCeiling };
    });
  }

  async #uncertain(requestID: string): Promise<void> {
    await this.db.query("UPDATE account_model_tasks SET state='uncertain',finished_at=now() WHERE request_id=$1 AND state='pending'",
      [requestID]).catch(() => {});
  }

  async #settle(account: string, requestID: string, observed: ObservedHostedResponse, charge: bigint, breached: boolean) {
    return transaction(this.db, async sql => {
      await lockPaidWallet(sql, account);
      const attempt = (await sql.query(`SELECT * FROM account_model_tasks
        WHERE request_id=$1 AND account_id=$2 FOR UPDATE`, [requestID, account])).rows[0];
      if (!attempt || attempt.state !== 'pending') throw new ServiceError('model_task_settlement_conflict', 503);
      if (charge > BigInt(attempt.hold_nano)) {
        await sql.query(`INSERT INTO account_model_task_reconciliation(reference,request_id,account_id,provider_response_id,
          usage,provider_cost_nano,reason) VALUES($1,$2,$3,$4,$5,$6,'hold_exceeded') ON CONFLICT(reference) DO NOTHING`,
        [`account-model-task:${requestID}`, requestID, account, observed.id, JSON.stringify(observed.usage), charge.toString()]);
        await sql.query("UPDATE account_model_tasks SET state='uncertain',limit_breached=true,finished_at=now() WHERE request_id=$1",
          [requestID]);
        return true;
      }
      await settlePaidInTransaction(sql, account, attempt.reservation_id, charge);
      const updated = await sql.query(`UPDATE account_model_tasks SET state='settled',provider_response_id=$2,input_tokens=$3,
        cached_input_tokens=$4,cache_write_tokens=$5,output_tokens=$6,search_calls=$7,cost_nano=$8,limit_breached=$9,
        finished_at=now() WHERE request_id=$1 AND state='pending'`, [requestID, observed.id, observed.usage.inputTokens,
        observed.usage.cachedInputTokens, observed.usage.cacheWriteTokens, observed.usage.outputTokens,
        observed.usage.searchCalls, charge.toString(), breached]);
      if (updated.rowCount !== 1) throw new ServiceError('model_task_settlement_conflict', 503);
      return false;
    });
  }
}
