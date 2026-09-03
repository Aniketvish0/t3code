const BUGBOT_COMMAND = "bugbot run verbose=true";
const TRUSTED_VOUCH_STATUSES = new Set(["bot", "collaborator", "vouched"]);

function bugbotMarker(headSha) {
  return `<!-- pr-vouch:bugbot:${headSha} -->`;
}

function hasBugbotRequest(comments, headSha) {
  const marker = bugbotMarker(headSha);
  return comments.some(
    (comment) => comment.user?.login === "github-actions[bot]" && comment.body?.includes(marker),
  );
}

function getBugbotDecision({ status, state, draft, eventName, wasTrusted, alreadyRequested }) {
  if (!TRUSTED_VOUCH_STATUSES.has(status)) {
    return { trigger: false, reason: `vouch status is ${status}` };
  }

  if (state !== "open") {
    return { trigger: false, reason: `PR is ${state}` };
  }

  if (draft) {
    return { trigger: false, reason: "PR is a draft" };
  }

  if (eventName === "push" && wasTrusted) {
    return { trigger: false, reason: "bulk vouch sync found an existing trusted label" };
  }

  if (alreadyRequested) {
    return { trigger: false, reason: "Bugbot was already requested for this commit" };
  }

  return { trigger: true, reason: "trusted PR needs a Bugbot review" };
}

function renderBugbotRequest(headSha) {
  return `${BUGBOT_COMMAND}\n\n${bugbotMarker(headSha)}`;
}

module.exports = {
  BUGBOT_COMMAND,
  getBugbotDecision,
  hasBugbotRequest,
  renderBugbotRequest,
};
