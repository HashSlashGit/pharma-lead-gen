import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkLastAdminMutation } from '../lib/utils/adminGuard.js';

describe('checkLastAdminMutation — last active admin protection', () => {

  // ── Non-admin targets — always pass through ───────────────────────────────

  test('non-admin: deactivation is allowed', () => {
    assert.equal(checkLastAdminMutation('user', 1, undefined, false), null);
  });

  test('non-admin: role change is allowed', () => {
    assert.equal(checkLastAdminMutation('user', 1, 'user', undefined), null);
  });

  // ── Multiple admins — single admin leaving still leaves one ───────────────

  test('admin demotion is allowed when 2 active admins exist', () => {
    assert.equal(checkLastAdminMutation('admin', 2, 'user', undefined), null);
  });

  test('admin deactivation is allowed when 2 active admins exist', () => {
    assert.equal(checkLastAdminMutation('admin', 2, undefined, false), null);
  });

  // ── Last admin — role demotion ─────────────────────────────────────────────

  test('last admin: role demotion to user is blocked', () => {
    const result = checkLastAdminMutation('admin', 1, 'user', undefined);
    assert.equal(result, 'Cannot demote the last admin account.');
  });

  test('last admin: role demotion + simultaneous deactivation is blocked (demotion wins)', () => {
    const result = checkLastAdminMutation('admin', 1, 'user', false);
    assert.equal(result, 'Cannot demote the last admin account.');
  });

  // ── Last admin — deactivation ──────────────────────────────────────────────

  test('last admin: deactivation (active=false) is blocked', () => {
    const result = checkLastAdminMutation('admin', 1, undefined, false);
    assert.equal(result, 'Cannot deactivate the last admin account.');
  });

  test('last admin: active=true update is allowed', () => {
    assert.equal(checkLastAdminMutation('admin', 1, undefined, true), null);
  });

  // ── Last admin — delete equivalent (adminCount === 0 edge case) ───────────
  // DELETE handler uses the same count query; simulate the scenario where
  // countDocuments returns 0 (admin already deleted by race — guard still fires).

  test('last admin: blocks when adminCount is 0 (concurrent-delete edge case)', () => {
    const result = checkLastAdminMutation('admin', 0, undefined, false);
    assert.equal(result, 'Cannot deactivate the last admin account.');
  });

  test('last admin: name/email-only update is always safe', () => {
    assert.equal(checkLastAdminMutation('admin', 1, undefined, undefined), null);
  });
});
