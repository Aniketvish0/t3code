import { describe, expect, it } from "vite-plus/test";

import { commandProgramName } from "./commandLabel.ts";

describe("commandProgramName", () => {
  it.each([
    ["/bin/zsh -lc 'vp test run apps/web/src/session-logic.test.ts'", "vp"],
    ["/bin/zsh -lc 'git diff --check'", "git"],
    ['/bin/zsh -lc "npx -y react-doctor@latest apps/web"', "npx"],
    ["/bin/zsh -lc 'rg -n \"registerHooks|worker\" apps/web/src'", "rg"],
    ["/bin/bash --noprofile --norc -l -c 'sed -n 1,270p file.ts'", "sed"],
    ["/bin/bash -o pipefail -lc 'vp test run'", "vp"],
    ["/bin/bash --rcfile /tmp/config -c 'git status'", "git"],
    ["sh -ec 'node scripts/check.js'", "node"],
    ["fish --command 'rg --files'", "rg"],
    ["zsh -lc 'CI=1 env -u DEBUG sudo -u root vp test run'", "vp"],
    ["env CI=1 /bin/zsh -lc '\"/Applications/My Tools/bin/check\" --verbose'", "check"],
    ["bash -lc \"zsh -c 'git status'\"", "git"],
    ['"C:\\Program Files\\Git\\bin\\bash.exe" -lc "git status"', "git"],
  ])("unwraps shell scripts without executing them: %s", (command, program) => {
    expect(commandProgramName(command)).toBe(program);
  });

  it.each([
    ["vp test run", "vp"],
    ["sudo -u root pnpm test", "pnpm"],
    ["env --split-string='CI=1 node scripts/check.js'", "node"],
    ['"C:\\Program Files\\nodejs\\node.exe" script.js', "node.exe"],
    ["/bin/zsh", "zsh"],
    ["/bin/bash -l", "bash"],
    ["zsh script.sh -c 'git status'", "zsh"],
    ["bash -- -c 'git status'", "bash"],
    ["bash --rcfile config.sh", "bash"],
    ["my-shell -c 'git status'", "my-shell"],
  ])("preserves ordinary programs and actual shell launches: %s", (command, program) => {
    expect(commandProgramName(command)).toBe(program);
  });

  it.each([
    "",
    "zsh -lc",
    "zsh -lc ''",
    "zsh -lc 'git status",
    "zsh -lc 'env'",
    'zsh -lc "git \\\"',
  ])("falls back for missing or malformed scripts: %s", (command) => {
    expect(commandProgramName(command)).toBeNull();
  });

  it.each([
    "if test -f package.json; then vp test; fi",
    "[ -f package.json ]",
    "[[ -f package.json ]]",
    "test -f package.json",
    'for file in *; do echo "$file"; done',
    "while true; do sleep 1; done",
    "until false; do sleep 1; done",
    "case $name in test) vp test;; esac",
    'select item in one two; do echo "$item"; done',
    "function check() { vp test; }",
    "check() { vp test; }",
    "{ vp test; }",
    "(vp test)",
    "(( count += 1 ))",
    "! vp test",
    ":",
    ". ./script.sh",
    "source ./script.sh",
    "eval 'vp test'",
    "cd packages/client-runtime",
    "export NODE_ENV=test",
    "local name=value",
    "set -e",
    "alias ll='ls -la'",
    "repeat 3 echo ok",
    "and vp test",
    "return 1",
    "break",
    "continue",
    "true",
    "false",
  ])("falls back for shell syntax and internal control commands: %s", (command) => {
    expect(commandProgramName(command)).toBeNull();
  });

  it.each([
    ['rg -n "if|for|while" src', "rg"],
    ["printf '%s\\n' 'a;b|c'", "printf"],
    ["node -e \"if (true) console.log('ok')\"", "node"],
    ["echo '$(git status)'", "echo"],
    ["vp test && git status", "vp"],
    ["vp test || git status", "vp"],
    ["rg needle src | head", "rg"],
    ["vp test; git status", "vp"],
    ["vp test &", "vp"],
    ["vp test\ngit status", "vp"],
    ['echo "$(git status)"', "echo"],
    ["echo `git status`", "echo"],
    ["cat <(rg needle src)", "cat"],
  ])("uses the first executable-looking program: %s", (command, program) => {
    expect(commandProgramName(command)).toBe(program);
  });

  it.each([
    ["cd packages/client-runtime && vp test run", "vp"],
    ['cd "a path with spaces"; git status', "git"],
    ["cd apps/web\npnpm test", "pnpm"],
    ["cd first && cd second && bun test", "bun"],
    ["CI=1 cd apps/web && npm test", "npm"],
    ['TMP=$(mktemp -d); cd "$TMP"; npm pack ./package', "npm"],
    ["cd $(find . -type d | head -1) && git status", "git"],
    ["cd `find . -type d | head -1` && node script.js", "node"],
    ["cd /tmp 2>&1 && npm test", "npm"],
    ["cd /tmp 2<&0 && pnpm test", "pnpm"],
    ["cd /tmp &>/dev/null && bun test", "bun"],
    ["cd work |& npm test", "npm"],
    ["cd /tmp && # use the selected workspace\nnpm test", "npm"],
    ["export CI=1; # first note\n# second note\npnpm test", "pnpm"],
    ["cd&&npm test", "npm"],
    ["export CI=1;pnpm test", "pnpm"],
    ["cd ${ROOT:-path;with;semicolons} && bun test", "bun"],
    ["cd ${ROOT:-path&&fallback} && node app.js", "node"],
    ["cd @(first|second) && npm test", "npm"],
    ["cd /tmp \\\n&& npm test", "npm"],
    ["/bin/zsh -lc 'cd apps/web && vp test run'", "vp"],
  ])("skips leading cd commands and uses the next useful program: %s", (command, program) => {
    expect(commandProgramName(command)).toBe(program);
  });

  it.each([
    ["source ~/.nvm/nvm.sh && nvm use", "nvm"],
    [". ./.env && pnpm test", "pnpm"],
    ["export CI=1 && vp test run", "vp"],
    ["unset DEBUG; node app.js", "node"],
    ["export CI=1 && cd apps/web && pnpm test", "pnpm"],
    ["/bin/zsh -lc 'source ~/.nvm/nvm.sh && nvm use'", "nvm"],
  ])("skips shell setup commands and uses the next useful program: %s", (command, program) => {
    expect(commandProgramName(command)).toBe(program);
  });

  it.each(
    ["cd /tmp", "export CI=1", "unset DEBUG", "source env.sh", ". env.sh"].flatMap((setup) =>
      ["&&", " || ", ";", "\n", "|", " |& ", " & "].map(
        (operator) => [`${setup}${operator}npm test`, "npm"] as const,
      ),
    ),
  )("handles shell setup followed by every command separator: %s", (command, program) => {
    expect(commandProgramName(command)).toBe(program);
  });

  it.each([
    ["command git status", "git"],
    ["command -p git status", "git"],
    ["command -- git status", "git"],
    ["builtin printf ok", "printf"],
    ["builtin -- echo ok", "echo"],
    ["exec node app.js", "node"],
    ["exec -cl -a worker node app.js", "node"],
    ["exec env CI=1 /opt/tools/check --verbose", "check"],
    ['exec "C:\\Program Files\\nodejs\\node.exe" app.js', "node.exe"],
    ["exec sh -c 'cd /tmp && npm test'", "npm"],
  ])("unwraps shell command wrappers: %s", (command, program) => {
    expect(commandProgramName(command)).toBe(program);
  });

  it.each([
    "command -v git",
    "command -V git",
    "command -a git",
    "command -pv git",
    "builtin -p",
    "exec",
    "exec > output.log",
    "exec --",
    "exec cd /tmp && npm test",
    "exec env CI=1 cd /tmp && npm test",
    "env CI=1 cd /tmp && npm test",
    "env CI=1; npm test",
    "sudo cd /tmp && npm test",
    "cd /tmp <<EOF\nunterminated heredoc",
    "cd /tmp && >/tmp/log",
    "(xcrun simctl io booted recordVideo /tmp/video.mp4 &) ; wait",
    "export CI=1 && (bundle exec pod install || pod install)",
    "$PY scripts/check.py",
    "${TOOL} --version",
    "%TOOL% --version",
    "!TOOL! --version",
    "@echo off",
    "rem comment",
    ":: comment",
    "time -- npm test",
    "time -v npm test",
    "coproc npm test",
    "coproc worker { npm test; }",
    "cd [first|second] && pnpm test",
    "npm) --version",
    "# comment only",
  ])("does not treat shell lookup and commandless wrapper forms as executions: %s", (command) => {
    expect(commandProgramName(command)).toBeNull();
  });

  it.each([
    ["env sh -c 'cd /tmp && npm test'", "npm"],
    ["sudo zsh -lc 'export CI=1 && pnpm test'", "pnpm"],
  ])("parses shell setup inside an explicitly launched shell: %s", (command, program) => {
    expect(commandProgramName(command)).toBe(program);
  });

  it.each([
    ["nocorrect pnpm test", "pnpm"],
    ["noglob bun test", "bun"],
    ["time node app.js", "node"],
    ["time -p deno test", "deno"],
    ["time nocorrect npm test", "npm"],
  ])("skips shell precommand modifiers: %s", (command, program) => {
    expect(commandProgramName(command)).toBe(program);
  });

  it("uses the command after leading shell comments", () => {
    expect(commandProgramName("# first comment\n  # second comment\ngit status")).toBe("git");
  });

  it("skips a shell array assignment before the command", () => {
    expect(commandProgramName("items=(one two); npm test")).toBe("npm");
  });

  it.each([
    ["ROOT=${BASE:-path with spaces}; npm test", "npm"],
    ["ROOT=`printf 'path with spaces'`; pnpm test", "pnpm"],
  ])("keeps expansions inside assignment words: %s", (command, program) => {
    expect(commandProgramName(command)).toBe(program);
  });

  it.each([
    [">/tmp/log && npm test", "npm"],
    ["2>/tmp/error.log; pnpm test", "pnpm"],
    ["cd /tmp && >/tmp/log npm test", "npm"],
    ["cd /tmp && > /tmp/log pnpm test", "pnpm"],
    ["cd /tmp && 2>&1 bun test", "bun"],
    ["cd /tmp && 2>& 1 node app.js", "node"],
    ["cd /tmp && &>/tmp/log git status", "git"],
    ["cd /tmp && *>>/tmp/log vp test", "vp"],
    ["cd /tmp && {output}>/tmp/log deno test", "deno"],
    ["cd /tmp && <<<input ruby script.rb", "ruby"],
  ])("skips redirections before the next command: %s", (command, program) => {
    expect(commandProgramName(command)).toBe(program);
  });

  it.each([
    ["cd /tmp <<EOF\nnot-a-command\nEOF\nnpm test", "npm"],
    ["cd /tmp <<'EOF'\nnot-a-command\nEOF\npnpm test", "pnpm"],
    ["cd /tmp <<'EOF'\nnot-a-command\\\nEOF\npnpm test", "pnpm"],
    ["cd /tmp <<-EOF\n\tnot-a-command\n\tEOF\nbun test", "bun"],
    ["cd /tmp <<A <<B\none\nA\ntwo\nB\ngit status", "git"],
    ["cd /tmp <<EOF; # setup\nnot-a-command\nEOF\nnpm test", "npm"],
    ["cd /tmp <<EOF && pnpm test\nnot-a-command\nEOF\nbun test", "pnpm"],
  ])("skips heredoc bodies before finding the next command: %s", (command, program) => {
    expect(commandProgramName(command)).toBe(program);
  });

  it.each(["cd apps/web && [ -f package.json ]", "cd apps/web || exit 1", "cd one && cd two"])(
    "falls back when no useful program follows cd: %s",
    (command) => {
      expect(commandProgramName(command)).toBeNull();
    },
  );

  it("bounds nested shell unwrapping", () => {
    let command = "git status";
    for (let depth = 0; depth < 9; depth += 1) {
      command = `sh -c '${command.replaceAll("'", "'\\''")}'`;
    }
    expect(commandProgramName(command)).toBeNull();
  });
});
