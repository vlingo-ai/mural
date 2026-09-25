"""Native wire DTO code generation for the explicitly selected closed schema graph.

Optional fields use presence wrappers so absent and explicit null survive round trips.
Scalar format/range validation remains at the API boundary, not in these wire codecs.
"""
import json


def native_graph(schemas, names):
    graph = {}

    def lower(schema, hint):
        if '$ref' in schema:
            prefix = '#/components/schemas/'
            if not schema['$ref'].startswith(prefix) or schema['$ref'][len(prefix):] not in names:
                raise ValueError('Unreviewed native reference')
            return schema['$ref'][len(prefix):] + 'DTO'
        kind = schema.get('type')
        if isinstance(kind, list):
            if len(kind) != 2 or 'null' not in kind:
                raise ValueError('Unsupported native type list')
            return ('nullable', lower({**schema, 'type': next(x for x in kind if x != 'null')}, hint))
        if kind == 'array':
            return ('array', lower(schema['items'], hint + 'Item'))
        if 'const' in schema and kind is None:
            kind = 'boolean' if isinstance(schema['const'], bool) else 'string' if isinstance(schema['const'], str) else None
        if kind in ('string', 'integer', 'boolean'):
            return kind
        branches = schema.get('oneOf')
        if branches and len(branches) == 2 and {'type': 'null'} in branches:
            return ('nullable', lower(next(x for x in branches if x != {'type': 'null'}), hint))
        if kind == 'object' and schema.get('additionalProperties') is False:
            fields = [(key, lower(value, hint + key[0].upper() + key[1:]), key not in schema.get('required', []), value)
                      for key, value in schema.get('properties', {}).items()]
            graph[hint] = ('object', fields)
            return hint
        if branches:
            resolved = [schemas[b['$ref'].split('/')[-1]] if '$ref' in b else b for b in branches]
            keys = set.intersection(*(set(b.get('properties', {})) for b in resolved))
            discriminator = next((k for k in sorted(keys) if all(isinstance(b['properties'][k].get('const'), str) for b in resolved)
                                  and len({b['properties'][k]['const'] for b in resolved}) == len(resolved)), None)
            if not discriminator:
                raise ValueError('Native union requires unique string discriminator')
            if 'discriminator' in schema:
                mapping = {b['properties'][discriminator]['const']: raw.get('$ref') for raw, b in zip(branches, resolved)}
                if schema['discriminator'] != {'propertyName': discriminator, 'mapping': mapping}:
                    raise ValueError('Discriminator mapping and variants disagree')
            variants = [(b['properties'][discriminator]['const'], lower(raw, hint + 'Variant' + str(i)))
                        for i, (raw, b) in enumerate(zip(branches, resolved))]
            graph[hint] = ('union', (discriminator, variants))
            return hint
        raise ValueError(f'Unsupported native schema {hint}')

    for name in names:
        lower(schemas[name], name + 'DTO')
    return graph


def typename(value, language):
    if isinstance(value, tuple):
        kind, child = value
        result = typename(child, language)
        return result + '?' if kind == 'nullable' else f'[{result}]' if language == 'swift' else f'List<{result}>'
    return {'string': 'String', 'integer': 'Int64' if language == 'swift' else 'Long',
            'boolean': 'Bool' if language == 'swift' else 'Boolean'}.get(value, value)


def render_native(schemas, names, header):
    graph = native_graph(schemas, names)
    swift = [header, 'import Foundation',
             'public enum WireField<T: Sendable>: Sendable { case missing; case present(T) }']
    kotlin = [header, '''package chat.mural.contracts
import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
sealed class WireField<out T> {
    data object Missing : WireField<Nothing>()
    data class Present<T>(val value: T) : WireField<T>()
}''']
    for name, (kind, data) in graph.items():
        if kind == 'union':
            key, variants = data
            swift += [f'public enum {name}: Codable, Sendable {{']
            swift += [f'    case variant{i}({typ})' for i, (_, typ) in enumerate(variants)]
            swift += [f'    private enum CodingKeys: String, CodingKey {{ case {key} }}',
                      '    public init(from decoder: Decoder) throws {',
                      '        let c = try decoder.container(keyedBy: CodingKeys.self)',
                      f'        switch try c.decode(String.self, forKey: .{key}) {{']
            swift += [f'        case {json.dumps(tag)}: self = .variant{i}(try {typ}(from: decoder))' for i, (tag, typ) in enumerate(variants)]
            swift += [f'        default: throw DecodingError.dataCorruptedError(forKey: .{key}, in: c, debugDescription: "Unknown discriminator")',
                      '        }', '    }', '    public func encode(to encoder: Encoder) throws {', '        switch self {']
            swift += [f'        case .variant{i}(let value): try value.encode(to: encoder)' for i in range(len(variants))]
            swift += ['        }', '    }', '}']
            kotlin += [f'@Serializable(with = {name}Serializer::class)', f'sealed class {name} {{']
            kotlin += [f'    data class Variant{i}(val value: {typ}) : {name}()' for i, (_, typ) in enumerate(variants)]
            kotlin += ['}', f'object {name}Serializer : KSerializer<{name}> {{',
                       '    override val descriptor: SerialDescriptor = JsonObject.serializer().descriptor',
                       f'    override fun deserialize(decoder: Decoder): {name} {{',
                       '        val input = decoder as? JsonDecoder ?: throw SerializationException("JSON required")',
                       '        val obj = input.decodeJsonElement().jsonObject',
                       f'        val tag = obj[{json.dumps(key)}] as? JsonPrimitive ?: throw SerializationException("Missing discriminator")',
                       '        if (!tag.isString) throw SerializationException("Invalid discriminator")',
                       '        return when (tag.content) {']
            kotlin += [f'            {json.dumps(tag)} -> {name}.Variant{i}(input.json.decodeFromJsonElement<{typ}>(obj))' for i, (tag, typ) in enumerate(variants)]
            kotlin += ['            else -> throw SerializationException("Unknown discriminator")', '        }', '    }',
                       f'    override fun serialize(encoder: Encoder, value: {name}) {{',
                       '        val output = encoder as? JsonEncoder ?: throw SerializationException("JSON required")',
                       '        output.encodeJsonElement(when (value) {']
            kotlin += [f'            is {name}.Variant{i} -> output.json.encodeToJsonElement(value.value)' for i in range(len(variants))]
            kotlin += ['        })', '    }', '}']
            continue
        fields = data
        swift += [f'public struct {name}: Codable, Sendable {{']
        for key, typ, optional, _ in fields:
            st = typename(typ, 'swift')
            swift.append(f'    public let {key}: ' + (f'WireField<{st}>' if optional else st))
        args = ', '.join(f'{key}: ' + (f'WireField<{typename(typ, "swift")}> = .missing' if optional else typename(typ, 'swift')) for key, typ, optional, _ in fields)
        swift += [f'    public init({args}) {{'] + [f'        self.{key} = {key}' for key, _, _, _ in fields] + ['    }']
        swift += ['    private enum CodingKeys: String, CodingKey { ' + '; '.join('case ' + key for key, _, _, _ in fields) + ' }',
                  '    public init(from decoder: Decoder) throws {', '        let c = try decoder.container(keyedBy: CodingKeys.self)']
        for key, typ, optional, schema in fields:
            value = f'try c.decode({typename(typ, "swift")}.self, forKey: .{key})'
            swift.append(f'        {key} = ' + (f'c.contains(.{key}) ? .present({value}) : .missing' if optional else value))
            allowed = [schema['const']] if 'const' in schema else schema.get('enum')
            if allowed:
                values = '[' + ', '.join(json.dumps(v) for v in allowed) + ']'
                predicate = f'if case .present(let candidate) = {key}, !{values}.contains(candidate)' if optional else f'if !{values}.contains({key})'
                swift.append(f'        {predicate} {{ throw DecodingError.dataCorruptedError(forKey: .{key}, in: c, debugDescription: "Enum/constant mismatch") }}')
        swift += ['    }', '    public func encode(to encoder: Encoder) throws {', '        var c = encoder.container(keyedBy: CodingKeys.self)']
        for key, _, optional, schema in fields:
            allowed = [schema['const']] if 'const' in schema else schema.get('enum')
            if allowed:
                values = '[' + ', '.join(json.dumps(v) for v in allowed) + ']'
                predicate = f'if case .present(let candidate) = {key}, !{values}.contains(candidate)' if optional else f'if !{values}.contains({key})'
                swift.append(f'        {predicate} {{ throw EncodingError.invalidValue({key}, .init(codingPath: encoder.codingPath, debugDescription: "Enum/constant mismatch")) }}')
            swift.append(f'        if case .present(let value) = {key} {{ try c.encode(value, forKey: .{key}) }}' if optional else f'        try c.encode({key}, forKey: .{key})')
        swift += ['    }', '}']
        kotlin += [f'@Serializable(with = {name}Serializer::class)', f'data class {name}(']
        kotlin += ['    val ' + key + ': ' + (f'WireField<{typename(typ, "kotlin")}> = WireField.Missing' if optional else typename(typ, 'kotlin')) + (',' if i < len(fields)-1 else '') for i, (key, typ, optional, _) in enumerate(fields)]
        kotlin += [')', f'object {name}Serializer : KSerializer<{name}> {{',
                   '    override val descriptor: SerialDescriptor = JsonObject.serializer().descriptor',
                   f'    override fun deserialize(decoder: Decoder): {name} {{',
                   '        val input = decoder as? JsonDecoder ?: throw SerializationException("JSON required")',
                   '        val obj = input.decodeJsonElement().jsonObject']
        for key, _, optional, schema in fields:
            allowed = [schema['const']] if 'const' in schema else schema.get('enum')
            if allowed:
                values = ', '.join(f'JsonPrimitive({json.dumps(v)})' for v in allowed)
                condition = (f'obj.containsKey({json.dumps(key)}) && ' if optional else '') + f'obj[{json.dumps(key)}] !in listOf({values})'
                kotlin.append(f'        if ({condition}) throw SerializationException("Enum/constant mismatch")')
        kotlin += [f'        return {name}(']
        for i, (key, typ, optional, _) in enumerate(fields):
            decode = f'input.json.decodeFromJsonElement<{typename(typ, "kotlin")}>(obj[{json.dumps(key)}] ?: throw SerializationException("Missing required field"))'
            kotlin.append(f'            {key} = ' + (f'if (obj.containsKey({json.dumps(key)})) WireField.Present({decode}) else WireField.Missing' if optional else decode) + (',' if i < len(fields)-1 else ''))
        kotlin += ['        )', '    }', f'    override fun serialize(encoder: Encoder, value: {name}) {{',
                   '        val output = encoder as? JsonEncoder ?: throw SerializationException("JSON required")']
        for key, _, optional, schema in fields:
            allowed = [schema['const']] if 'const' in schema else schema.get('enum')
            if allowed:
                values = ', '.join(json.dumps(v) for v in allowed)
                condition = f'value.{key} is WireField.Present && value.{key}.value !in listOf({values})' if optional else f'value.{key} !in listOf({values})'
                kotlin.append(f'        if ({condition}) throw SerializationException("Enum/constant mismatch")')
        kotlin += ['        output.encodeJsonElement(buildJsonObject {']
        for key, _, optional, _ in fields:
            kotlin.append(f'            if (value.{key} is WireField.Present) put({json.dumps(key)}, output.json.encodeToJsonElement(value.{key}.value))' if optional else f'            put({json.dumps(key)}, output.json.encodeToJsonElement(value.{key}))')
        kotlin += ['        })', '    }', '}']
    return '\n'.join(swift) + '\n', '\n'.join(kotlin) + '\n'
