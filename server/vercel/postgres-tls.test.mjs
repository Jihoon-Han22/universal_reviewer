import test from 'node:test';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import pg from 'pg';
import { postgresConnectionOptions } from './postgres.mjs';

test('Supabase URL cannot overwrite verified TLS and the official CA', () => {
  const options = postgresConnectionOptions('postgres://test:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require');
  const client = new pg.Client(options);
  assert.equal(client.ssl.rejectUnauthorized, true);
  const certificate = new X509Certificate(client.ssl.ca.at(-1));
  assert.equal(certificate.ca, true);
  assert.match(certificate.subject, /Supabase/);
  assert.equal(new URL(options.connectionString).searchParams.has('sslmode'), false);
});

test('other database hosts retain their supplied connection settings', () => {
  const connectionString = 'postgres://test:password@localhost/test';
  assert.deepEqual(postgresConnectionOptions(connectionString), { connectionString });
});
