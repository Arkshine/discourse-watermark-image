import { getOwner } from "@ember/owner";
import { setupTest } from "ember-qunit";
import { module, test } from "qunit";
import { AUTO_GROUPS } from "discourse/lib/constants";
import matchProfile, {
  resolveComposerTags,
} from "../../discourse/lib/match-profile";

function buildComposer(owner, { categoryId, tags, topicTags } = {}) {
  const store = getOwner(owner).lookup("service:store");
  const topic =
    topicTags === undefined
      ? undefined
      : store.createRecord("topic", { tags: topicTags });

  return store.createRecord("composer", { categoryId, tags, topic });
}

function buildUser(owner, ...groupIds) {
  const store = getOwner(owner).lookup("service:store");
  return store.createRecord("user", {
    groups: groupIds.map((id) => store.createRecord("group", { id })),
  });
}

module("Unit | Lib | match-profile", function (hooks) {
  setupTest(hooks);

  test("returns null when profiles is not an array", function (assert) {
    const composer = buildComposer(this, { categoryId: 1 });
    const user = buildUser(this);

    assert.strictEqual(matchProfile(undefined, composer, user), null);
    assert.strictEqual(matchProfile(null, composer, user), null);
    assert.strictEqual(matchProfile({}, composer, user), null);
  });

  test("returns null for an empty list", function (assert) {
    assert.strictEqual(
      matchProfile([], buildComposer(this, { categoryId: 1 }), buildUser(this)),
      null
    );
  });

  test("skips disabled profiles", function (assert) {
    const profile = { enabled: false, user_in_groups: true };

    assert.strictEqual(
      matchProfile(
        [profile],
        buildComposer(this, { categoryId: 1 }),
        buildUser(this)
      ),
      null
    );
  });

  test("user_in_groups gates the match", function (assert) {
    const inGroup = { enabled: true, user_in_groups: true };
    const notInGroup = { enabled: true, user_in_groups: false };
    const composer = buildComposer(this, { categoryId: 1 });
    const user = buildUser(this);

    assert.strictEqual(matchProfile([inGroup], composer, user), inGroup);
    assert.strictEqual(matchProfile([notInGroup], composer, user), null);
  });

  test("category-only profile matches only in its categories", function (assert) {
    const profile = { enabled: true, categories: [5, 6] };
    const user = buildUser(this);

    assert.strictEqual(
      matchProfile([profile], buildComposer(this, { categoryId: 5 }), user),
      profile
    );
    assert.strictEqual(
      matchProfile([profile], buildComposer(this, { categoryId: 9 }), user),
      null
    );
  });

  test("tag-only profile matches when any listed tag is present", function (assert) {
    const profile = { enabled: true, tags: ["foo", "bar"] };
    const user = buildUser(this);

    assert.strictEqual(
      matchProfile(
        [profile],
        buildComposer(this, { categoryId: 1, tags: ["bar"] }),
        user
      ),
      profile
    );
    assert.strictEqual(
      matchProfile(
        [profile],
        buildComposer(this, { categoryId: 1, tags: ["baz"] }),
        user
      ),
      null
    );
    assert.strictEqual(
      matchProfile(
        [profile],
        buildComposer(this, { categoryId: 1, tags: [] }),
        user
      ),
      null,
      "no tags on the topic fails a tag-restricted profile"
    );
    assert.strictEqual(
      matchProfile([profile], buildComposer(this, { categoryId: 1 }), user),
      null,
      "missing tags on the composer model fails a tag-restricted profile"
    );
  });

  test("matches tags on a new topic", function (assert) {
    const profile = { enabled: true, tags: ["tv"] };
    const store = getOwner(this).lookup("service:store");
    const tag = store.createRecord("tag", { id: 20, name: "tv", slug: "tv" });

    assert.strictEqual(
      matchProfile(
        [profile],
        buildComposer(this, { categoryId: 1, tags: [tag] }),
        buildUser(this)
      ),
      profile
    );
  });

  test("falls back to topic tags on reply", function (assert) {
    const profile = { enabled: true, tags: ["tv"] };
    const user = buildUser(this);

    assert.strictEqual(
      matchProfile(
        [profile],
        buildComposer(this, { categoryId: 1, tags: [], topicTags: ["tv"] }),
        user
      ),
      profile
    );
    assert.strictEqual(
      matchProfile(
        [profile],
        buildComposer(this, { categoryId: 1, topicTags: ["tv"] }),
        user
      ),
      profile
    );
    assert.strictEqual(
      matchProfile(
        [profile],
        buildComposer(this, { categoryId: 1, tags: [], topicTags: ["other"] }),
        user
      ),
      null
    );
  });

  test("resolveComposerTags prefers new-topic tags over reply topic tags", function (assert) {
    assert.deepEqual(
      resolveComposerTags(
        buildComposer(this, {
          categoryId: 1,
          tags: ["foo"],
          topicTags: ["bar"],
        })
      ),
      ["foo"]
    );
    assert.deepEqual(
      resolveComposerTags(buildComposer(this, { categoryId: 1 })),
      []
    );
  });

  test("matches when no restrictions are set", function (assert) {
    const noKeys = { enabled: true };
    const emptyKeys = { enabled: true, categories: [], tags: [] };
    const composer = buildComposer(this, { categoryId: 1, tags: [] });
    const user = buildUser(this);

    assert.strictEqual(matchProfile([noKeys], composer, user), noKeys);
    assert.strictEqual(matchProfile([emptyKeys], composer, user), emptyKeys);
  });

  test("requires both category and group when both are set", function (assert) {
    const profile = { enabled: true, categories: [5], user_in_groups: true };
    const user = buildUser(this);

    assert.strictEqual(
      matchProfile([profile], buildComposer(this, { categoryId: 5 }), user),
      profile
    );
    assert.strictEqual(
      matchProfile([profile], buildComposer(this, { categoryId: 9 }), user),
      null,
      "category miss fails even when the group matches"
    );
    assert.strictEqual(
      matchProfile(
        [{ ...profile, user_in_groups: false }],
        buildComposer(this, { categoryId: 5 }),
        user
      ),
      null,
      "group miss fails even when the category matches"
    );
  });

  test("requires both category and tags when both are set", function (assert) {
    const profile = { enabled: true, categories: [5], tags: ["foo"] };
    const user = buildUser(this);

    assert.strictEqual(
      matchProfile(
        [profile],
        buildComposer(this, { categoryId: 5, tags: ["foo"] }),
        user
      ),
      profile
    );
    assert.strictEqual(
      matchProfile(
        [profile],
        buildComposer(this, { categoryId: 9, tags: ["foo"] }),
        user
      ),
      null,
      "category miss fails even when the tags match"
    );
    assert.strictEqual(
      matchProfile(
        [profile],
        buildComposer(this, { categoryId: 5, tags: ["bar"] }),
        user
      ),
      null,
      "tag miss fails even when the category matches"
    );
  });

  // DEPRECATED: legacy pipe-separated `groups` fallback, used until `user_in_groups` is set everywhere.
  module("deprecated groups fallback", function () {
    test("matches when the everyone group is included", function (assert) {
      const profile = { enabled: true, groups: `${AUTO_GROUPS.everyone.id}` };

      assert.strictEqual(
        matchProfile(
          [profile],
          buildComposer(this, { categoryId: 1 }),
          buildUser(this)
        ),
        profile
      );
    });

    test("matches when the user belongs to a required group", function (assert) {
      const profile = { enabled: true, groups: "10|11" };

      assert.strictEqual(
        matchProfile(
          [profile],
          buildComposer(this, { categoryId: 1 }),
          buildUser(this, 11)
        ),
        profile
      );
    });

    test("does not match when the user is in none of the groups", function (assert) {
      const profile = { enabled: true, groups: "10|11" };

      assert.strictEqual(
        matchProfile(
          [profile],
          buildComposer(this, { categoryId: 1 }),
          buildUser(this, 99)
        ),
        null
      );
    });

    test("user_in_groups takes precedence over legacy groups", function (assert) {
      const profile = {
        enabled: true,
        user_in_groups: false,
        groups: `${AUTO_GROUPS.everyone.id}`,
      };

      assert.strictEqual(
        matchProfile(
          [profile],
          buildComposer(this, { categoryId: 1 }),
          buildUser(this)
        ),
        null,
        "an explicit user_in_groups=false wins over an everyone legacy group"
      );
    });
  });

  test("returns the first matching enabled profile", function (assert) {
    const disabled = { enabled: false, user_in_groups: true };
    const first = { enabled: true, categories: [5], user_in_groups: true };
    const second = { enabled: true, user_in_groups: true };
    const user = buildUser(this);

    assert.strictEqual(
      matchProfile(
        [disabled, first, second],
        buildComposer(this, { categoryId: 5 }),
        user
      ),
      first,
      "skips the disabled profile and stops at the first match"
    );
    assert.strictEqual(
      matchProfile(
        [disabled, first, second],
        buildComposer(this, { categoryId: 9 }),
        user
      ),
      second,
      "falls through to the next profile when the first misses"
    );
  });
});
