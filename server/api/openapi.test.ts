import yaml from 'js-yaml';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

test('TV season endpoint documents the is4k query parameter', () => {
  const spec = yaml.load(
    fs.readFileSync(path.resolve(process.cwd(), 'seerr-api.yml'), 'utf8')
  ) as {
    paths: Record<
      string,
      {
        get?: {
          parameters?: {
            in: string;
            name: string;
            schema?: { type?: string };
          }[];
        };
      }
    >;
  };

  const parameters =
    spec.paths['/tv/{tvId}/season/{seasonNumber}'].get?.parameters ?? [];
  const is4k = parameters.find(
    (parameter) => parameter.in === 'query' && parameter.name === 'is4k'
  );

  assert.equal(is4k?.schema?.type, 'boolean');
});
