/**
 * Introspection tool names aligned with Capsule MCP product tools
 * (`list_capsule_commands` / `describe_capsule_command`).
 */
export class CapsuleAgentBuiltinToolNames {
  static readonly listCommands = "list_capsule_commands";
  static readonly describeCommand = "describe_capsule_command";

  static isBuiltin(name: string): boolean {
    return (
      name === CapsuleAgentBuiltinToolNames.listCommands ||
      name === CapsuleAgentBuiltinToolNames.describeCommand
    );
  }
}
