## Summary

<!-- What changed and why. -->

## Checklist

- [ ] Describes the user-visible change, or states there is none.
- [ ] Says how it was verified (device/simulator, or why that wasn't possible).
- [ ] A change under `apps/ios/Core/` has the matching change under `apps/android/app/src/main/java/chat/mural/core/`, verified with `python3 scripts/check_cross_platform.py`.
- [ ] Fixtures under `shared/fixtures/cross-platform/` are updated if shared behavior changed.
- [ ] Notes any remaining limitations.
- [ ] Aligns with the accepted development baseline and updates affected Web/iOS/Android, API/Worker and deployment documentation.
- [ ] Separates local tests, deployed behavior and live acceptance; historical evidence is not rewritten as a current pass.
- [ ] Updates `docs/operations/release-verification-plan.md` after this iteration's verification: adds the dated evidence link/results to its iteration register and updates reusable rules/automation status, or explicitly records that no rule change was needed. Includes failures, blocked and unrun checks.
