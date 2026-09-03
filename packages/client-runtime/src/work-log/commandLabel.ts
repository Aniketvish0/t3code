type CommandWrapper = "env" | "sudo";

const SHELL_PROGRAMS = new Set(["sh", "bash", "zsh", "dash", "ash", "ksh", "fish"]);
const SHELL_OPTIONS_WITH_VALUE = new Set(["-o", "-O", "--rcfile", "--init-file"]);
const SKIPPABLE_SHELL_SETUP_PROGRAMS = new Set([".", "cd", "export", "source", "unset"]);
const SHELL_COMMAND_WRAPPERS = new Set(["builtin", "command", "exec"]);

// These tokens describe shell syntax or shell-local control flow, not a useful
// executable name. Falling back to "command" is less misleading than labels
// such as "Ran if", "Ran [", or "Ran function".
const NON_DESCRIPTIVE_SHELL_PROGRAMS = new Set([
  "!",
  ".",
  ":",
  "[",
  "[[",
  "alias",
  "and",
  "autoload",
  "begin",
  "bg",
  "bind",
  "bindkey",
  "break",
  "builtin",
  "caller",
  "case",
  "catch",
  "cd",
  "class",
  "command",
  "compgen",
  "complete",
  "compopt",
  "continue",
  "coproc",
  "data",
  "declare",
  "define",
  "dirs",
  "disown",
  "do",
  "done",
  "dynamicparam",
  "elif",
  "else",
  "elseif",
  "enable",
  "end",
  "esac",
  "eval",
  "exec",
  "exit",
  "export",
  "false",
  "fc",
  "fg",
  "filter",
  "fi",
  "finally",
  "for",
  "foreach",
  "from",
  "function",
  "getopts",
  "hash",
  "help",
  "hidden",
  "history",
  "if",
  "in",
  "inlinescript",
  "jobs",
  "let",
  "local",
  "logout",
  "mapfile",
  "nocorrect",
  "not",
  "or",
  "parallel",
  "param",
  "popd",
  "process",
  "pushd",
  "read",
  "readarray",
  "readonly",
  "repeat",
  "return",
  "select",
  "sequence",
  "set",
  "setopt",
  "shift",
  "shopt",
  "source",
  "static",
  "switch",
  "suspend",
  "test",
  "then",
  "throw",
  "time",
  "times",
  "trap",
  "true",
  "try",
  "type",
  "typeset",
  "ulimit",
  "umask",
  "unalias",
  "until",
  "unset",
  "unsetopt",
  "using",
  "var",
  "wait",
  "while",
  "workflow",
]);

function shellCommandArgumentIndex(tokens: ReadonlyArray<string>, start: number): number | null {
  for (let index = start; index < tokens.length; index += 1) {
    const option = tokens[index]!;
    if (option === "--" || !option.startsWith("-")) return null;
    if (SHELL_OPTIONS_WITH_VALUE.has(option)) {
      index += 1;
      continue;
    }
    if (option === "--command" || /^-[a-zA-Z]*c[a-zA-Z]*$/.test(option)) return index + 1;
  }
  return null;
}

const COMMAND_WRAPPER_OPTIONS_WITH_VALUE: Record<CommandWrapper, ReadonlySet<string>> = {
  env: new Set(["-C", "--chdir", "-S", "--split-string", "-u", "--unset"]),
  sudo: new Set(["-C", "--close-from", "-D", "--chdir", "-g", "--group", "-u", "--user"]),
};

const COMMAND_WRAPPER_FLAGS: Record<CommandWrapper, ReadonlySet<string>> = {
  env: new Set(["-0", "--null", "-i", "--ignore-environment", "--debug", "-v"]),
  sudo: new Set(["-A", "--askpass", "-b", "--background", "-E", "-H", "-i", "-n", "-S"]),
};

function tokenizeShellCommand(command: string): string[] | null {
  const input = command.trim();
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;
  let substitutionDepth = 0;
  let tokenStarted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (escaping) {
      current += character;
      escaping = false;
      tokenStarted = true;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      const nextCharacter = input[index + 1];
      const isWindowsDrivePath = quote === null && /^[A-Za-z]:/.test(current);
      if (
        (quote === '"' || isWindowsDrivePath) &&
        nextCharacter !== undefined &&
        nextCharacter !== '"' &&
        nextCharacter !== "\\" &&
        nextCharacter !== "$" &&
        nextCharacter !== "`" &&
        nextCharacter !== "\n"
      ) {
        current += character;
        tokenStarted = true;
        continue;
      }
      escaping = true;
      tokenStarted = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      tokenStarted = true;
      continue;
    }
    if (character === "$" && input[index + 1] === "(") {
      current += "$(";
      substitutionDepth += 1;
      tokenStarted = true;
      index += 1;
      continue;
    }
    if (character === ")" && substitutionDepth > 0) {
      current += character;
      substitutionDepth -= 1;
      tokenStarted = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (/\s/u.test(character)) {
      if (substitutionDepth > 0) {
        current += character;
        tokenStarted = true;
        continue;
      }
      if (tokenStarted) {
        tokens.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }
    current += character;
    tokenStarted = true;
  }

  if (quote !== null || escaping || substitutionDepth > 0) return null;
  if (tokenStarted) tokens.push(current);
  return tokens;
}

function commandAfterFirstShellCommand(command: string): string | null {
  let quote: '"' | "'" | null = null;
  let escaping = false;
  let inBackticks = false;
  let inComment = false;
  let substitutionDepth = 0;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!;
    if (inComment) {
      if (character !== "\n") continue;
      inComment = false;
    }
    if (escaping) {
      escaping = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if (inBackticks) {
      if (character === "`") inBackticks = false;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "`") {
      inBackticks = true;
      continue;
    }
    if (
      character === "#" &&
      (index === 0 || /\s/u.test(command[index - 1]!) || ";&|(".includes(command[index - 1]!))
    ) {
      inComment = true;
      continue;
    }
    if (
      character === "(" &&
      (substitutionDepth > 0 ||
        command[index - 1] === "$" ||
        /[<>]/u.test(command[index - 1] ?? ""))
    ) {
      substitutionDepth += 1;
      continue;
    }
    if (character === ")" && substitutionDepth > 0) {
      substitutionDepth -= 1;
      continue;
    }
    if (substitutionDepth > 0) continue;

    const isDoubleOperator =
      (character === "&" && command[index + 1] === "&") ||
      (character === "|" && (command[index + 1] === "|" || command[index + 1] === "&"));
    const isRedirectionAmpersand =
      character === "&" &&
      (command[index - 1] === ">" || command[index - 1] === "<" || command[index + 1] === ">");
    if ((!isDoubleOperator && !";&|\n".includes(character)) || isRedirectionAmpersand) continue;

    let nextCommandIndex = index + (isDoubleOperator ? 2 : 1);
    while (/\s/u.test(command[nextCommandIndex] ?? "")) nextCommandIndex += 1;
    const nextCommand = command.slice(nextCommandIndex).trim();
    return nextCommand || null;
  }

  return null;
}

function serializeShellTokens(tokens: ReadonlyArray<string>): string {
  return tokens.map((token) => JSON.stringify(token)).join(" ");
}

function wrappedShellCommandProgramName(
  wrapper: string,
  tokens: ReadonlyArray<string>,
  start: number,
  depth: number,
): string | null {
  let index = start;

  if (wrapper === "command") {
    while (index < tokens.length) {
      const option = tokens[index]!;
      if (option === "--") {
        index += 1;
        break;
      }
      if (!option.startsWith("-") || option === "-") break;
      if (option !== "-p") return null;
      index += 1;
    }
  } else if (wrapper === "builtin") {
    if (tokens[index] === "--") index += 1;
    else if (tokens[index]?.startsWith("-")) return null;
  } else if (wrapper === "exec") {
    while (index < tokens.length) {
      const option = tokens[index]!;
      if (option === "--") {
        index += 1;
        break;
      }
      if (option === "-a") {
        if (tokens[index + 1] === undefined) return null;
        index += 2;
        continue;
      }
      if (/^-a.+/u.test(option) || /^-[cl]+$/u.test(option)) {
        index += 1;
        continue;
      }
      if (option.startsWith("-") && option !== "-") return null;
      break;
    }
  }

  const wrappedTokens = tokens.slice(index);
  if (wrappedTokens.length === 0 || /^\d*(?:>|<)/u.test(wrappedTokens[0]!)) return null;
  return commandProgramName(serializeShellTokens(wrappedTokens), depth + 1);
}

export function commandProgramName(command: string, depth = 0): string | null {
  if (depth >= 8) return null;
  const tokens = tokenizeShellCommand(command);
  if (tokens === null) return null;
  let index = 0;
  let wrapper: CommandWrapper | null = null;

  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) return null;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      index += 1;
      continue;
    }
    const tokenProgram = token.split(/[\\/]/).at(-1);
    if (tokenProgram === "env" || tokenProgram === "sudo") {
      wrapper = tokenProgram;
      index += 1;
      continue;
    }
    if (wrapper !== null && token === "--") {
      wrapper = null;
      index += 1;
      continue;
    }
    if (wrapper !== null && token.startsWith("-")) {
      if (wrapper === "env" && (token === "-S" || token === "--split-string")) {
        const splitCommand = tokens[index + 1];
        return splitCommand ? commandProgramName(splitCommand, depth + 1) : null;
      }
      if (wrapper === "env" && token.startsWith("--split-string=")) {
        return commandProgramName(token.slice("--split-string=".length), depth + 1);
      }
      if (COMMAND_WRAPPER_OPTIONS_WITH_VALUE[wrapper].has(token)) {
        if (tokens[index + 1] === undefined) return null;
        index += 2;
        continue;
      }
      if (COMMAND_WRAPPER_FLAGS[wrapper].has(token)) {
        index += 1;
        continue;
      }
      const equalsIndex = token.indexOf("=");
      if (token.startsWith("--") && equalsIndex > 2) {
        if (!COMMAND_WRAPPER_OPTIONS_WITH_VALUE[wrapper].has(token.slice(0, equalsIndex))) {
          return null;
        }
        index += 1;
        continue;
      }
      if (/^-[A-Za-z].+/.test(token) && !token.startsWith("--")) {
        let consumesNextToken = false;
        for (const [optionIndex, option] of token.slice(1).split("").entries()) {
          const shortOption = `-${option}`;
          if (COMMAND_WRAPPER_OPTIONS_WITH_VALUE[wrapper].has(shortOption)) {
            consumesNextToken = optionIndex === token.length - 2;
            break;
          }
          if (!COMMAND_WRAPPER_FLAGS[wrapper].has(shortOption)) return null;
        }
        if (consumesNextToken && tokens[index + 1] === undefined) return null;
        index += consumesNextToken ? 2 : 1;
        continue;
      }
      return null;
    }
    if (tokenProgram && SHELL_PROGRAMS.has(tokenProgram.replace(/\.exe$/i, "").toLowerCase())) {
      const scriptIndex = shellCommandArgumentIndex(tokens, index + 1);
      if (scriptIndex !== null) {
        const script = tokens[scriptIndex];
        return script ? commandProgramName(script, depth + 1) : null;
      }
    }
    const normalizedTokenProgram = tokenProgram?.toLowerCase();
    if (normalizedTokenProgram && SHELL_COMMAND_WRAPPERS.has(normalizedTokenProgram)) {
      return wrappedShellCommandProgramName(normalizedTokenProgram, tokens, index + 1, depth);
    }
    if (normalizedTokenProgram && SKIPPABLE_SHELL_SETUP_PROGRAMS.has(normalizedTokenProgram)) {
      const nextCommand = commandAfterFirstShellCommand(command);
      return nextCommand ? commandProgramName(nextCommand, depth + 1) : null;
    }
    if (
      !tokenProgram ||
      NON_DESCRIPTIVE_SHELL_PROGRAMS.has(tokenProgram.toLowerCase()) ||
      "<>(){}[];|&".includes(tokenProgram[0] ?? "") ||
      tokenProgram.endsWith("()")
    ) {
      return null;
    }
    return tokenProgram || null;
  }

  return null;
}
