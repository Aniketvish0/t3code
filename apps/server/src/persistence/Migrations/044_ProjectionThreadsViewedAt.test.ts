import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("044_ProjectionThreadsViewedAt", (it) => {
  it.effect("adds viewed_at and backfills existing threads as read", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 43 });
      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          runtime_mode,
          interaction_mode,
          created_at,
          updated_at
        ) VALUES (
          'thread-1',
          'project-1',
          'Historical thread',
          'full-access',
          'default',
          '2026-01-01T00:00:00.000Z',
          '2026-01-02T00:00:00.000Z'
        )
      `;

      const migrations = yield* runMigrations({ toMigrationInclusive: 44 });
      assert.deepEqual(migrations, [[44, "ProjectionThreadsViewedAt"]]);

      const rows = yield* sql<{ readonly viewedAt: string | null }>`
        SELECT viewed_at AS "viewedAt"
        FROM projection_threads
        WHERE thread_id = 'thread-1'
      `;
      assert.deepEqual(rows, [{ viewedAt: "2026-01-02T00:00:00.000Z" }]);

      const rerun = yield* runMigrations({ toMigrationInclusive: 44 });
      assert.deepEqual(rerun, []);
    }),
  );
});
