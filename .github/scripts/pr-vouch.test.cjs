const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BUGBOT_COMMAND,
  getBugbotDecision,
  hasBugbotRequest,
  renderBugbotRequest,
} = require("./pr-vouch.cjs");

const eligible = {
  status: "vouched",
  state: "open",
  draft: false,
  eventName: "pull_request_target",
  wasTrusted: true,
  alreadyRequested: false,
};

test("triggers Bugbot for every trusted vouch status", () => {
  for (const status of ["bot", "collaborator", "vouched"]) {
    assert.equal(getBugbotDecision({ ...eligible, status }).trigger, true);
  }
});

test("does not trigger Bugbot for untrusted or denounced authors", () => {
  for (const status of ["unknown", "denounced", undefined]) {
    assert.equal(getBugbotDecision({ ...eligible, status }).trigger, false);
  }
});

test("does not trigger Bugbot for closed or draft PRs", () => {
  assert.equal(getBugbotDecision({ ...eligible, state: "closed" }).trigger, false);
  assert.equal(getBugbotDecision({ ...eligible, draft: true }).trigger, false);
});

test("keeps a newly trusted bulk PR eligible until its label is synced", () => {
  assert.equal(
    getBugbotDecision({ ...eligible, eventName: "push", wasTrusted: false }).trigger,
    true,
  );
  assert.equal(
    getBugbotDecision({ ...eligible, eventName: "push", wasTrusted: true }).trigger,
    false,
  );
});

test("does not trigger Bugbot twice for one head commit", () => {
  assert.equal(getBugbotDecision({ ...eligible, alreadyRequested: true }).trigger, false);
});

test("only accepts the matching marker from github-actions", () => {
  const headSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const marker = `<!-- pr-vouch:bugbot:${headSha} -->`;

  assert.equal(
    hasBugbotRequest([{ user: { login: "github-actions[bot]" }, body: marker }], headSha),
    true,
  );
  assert.equal(
    hasBugbotRequest([{ user: { login: "someone-else" }, body: marker }], headSha),
    false,
  );
  assert.equal(
    hasBugbotRequest(
      [
        {
          user: { login: "github-actions[bot]" },
          body: "<!-- pr-vouch:bugbot:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb -->",
        },
      ],
      headSha,
    ),
    false,
  );
});

test("renders the documented verbose Bugbot command with the commit marker", () => {
  const headSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  assert.equal(
    renderBugbotRequest(headSha),
    `${BUGBOT_COMMAND}\n\n<!-- pr-vouch:bugbot:${headSha} -->`,
  );
});
