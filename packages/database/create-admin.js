// create-admin.js — interactive administrator bootstrap AND password recovery.
//
//   node packages/database/create-admin.js          Create a new ADMIN account
//   node packages/database/create-admin.js reset    Reset an existing account's
//                                                   password (recovery path;
//                                                   see docs/AUTH.md §Recovery)
//
// Password input is hidden. Minimum length 12 enforced. Only success/failure
// and the account email are printed — never the password or its hash.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const readline = require('readline');

const prisma = new PrismaClient();

function askHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const original = rl._writeToOutput;
    rl._writeToOutput = function (chunk) {
      if (chunk.includes(query)) rl.output.write(chunk);
      else if (!chunk.includes('\n')) rl.output.write('*');
    };
    rl.question(query, (answer) => {
      rl._writeToOutput = original;
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (answer) => { rl.close(); resolve(answer); }));
}

async function changePassword(user, label) {
  const password = await askHidden(`Enter new password for ${label}: `);
  const confirm = await askHidden('Confirm new password: ');
  if (password !== confirm) {
    console.log('\n[FAIL] Passwords do not match.');
    return false;
  }
  if (password.length < 12) {
    console.log('\n[FAIL] Password must be at least 12 characters.');
    return false;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  console.log(`\n[OK] Password updated for: ${user.email}`);
  return true;
}

async function main() {
  const resetMode = process.argv[2] === 'reset';
  console.log('\n--- Agent Foundry Administrator ' + (resetMode ? 'Password Reset' : 'Bootstrap') + ' ---');
  const email = (await ask('Enter admin email: ')).trim().toLowerCase();
  if (!email || email.length > 254 || !email.includes('@')) {
    console.log('[FAIL] A valid email address is required.');
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (resetMode) {
    if (!existing) { console.log('[FAIL] No account with this email exists.'); return; }
    await changePassword(existing, email);
    return;
  }
  if (existing) {
    console.log('[FAIL] An account with this email already exists. Run with "reset" to change its password.');
    return;
  }
  const password = await askHidden('Enter secure password (min 12 chars): ');
  const confirm = await askHidden('Confirm password: ');
  if (password !== confirm) { console.log('\n[FAIL] Passwords do not match.'); return; }
  if (password.length < 12) { console.log('\n[FAIL] Password must be at least 12 characters.'); return; }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, passwordHash, role: 'ADMIN' } });
  console.log(`\n[OK] Administrator created for: ${user.email}`);
}

main()
  .catch((error) => { console.error('\n[FAIL]', error instanceof Error ? error.message : 'unknown error'); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
