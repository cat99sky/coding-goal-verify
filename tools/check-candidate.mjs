#!/usr/bin/env node
// Candidate acceptance runner for the fixture repo.
//
// The fixture is a public repository, so this script needs no credentials and
// no git: it downloads the candidate commit tarball over the GitHub HTTPS API,
// extracts it with a minimal in-process tar reader (Node's child_process pipes
// are unavailable in the verification sandbox), then evaluates the candidate's
// own tools/accept.mjs in-process and reports its exit code plus captured
// failure lines.
//
// Usage: node tools/check-candidate.mjs [ref]
//   ref  branch name, tag, or commit sha; when omitted the branch most
//        recently updated after `main` (the Coding candidate) is used.
//
// Exit code 0 = candidate passes the gate, 1 = it fails, 2 = harness error.

import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = 'cat99sky/coding-goal-verify';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = resolve(root, '.candidate');

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { 'user-agent': 'coding-goal-verify', accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub API ${path} -> HTTP ${response.status}`);
  return response;
}

async function resolveRef(argRef) {
  if (argRef) return argRef;
  const response = await github(`/repos/${REPO}/branches`);
  const branches = (await response.json()).filter((branch) => branch.name !== 'main');
  if (branches.length === 0) throw new Error('no candidate branch found');
  branches.sort((a, b) => Date.parse(b.commit?.commit?.committer?.date ?? 0) - Date.parse(a.commit?.commit?.committer?.date ?? 0));
  return branches[0].name;
}

function readString(buffer, start, length) {
  const slice = buffer.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8');
}

function extractTar(tar, destination) {
  let offset = 0;
  let written = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readString(header, 0, 100);
    const size = Number.parseInt(readString(header, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = readString(header, 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    offset += 512;
    const body = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (!fullName) continue;
    const relative = fullName.split('/').slice(1).join('/');
    if (!relative) continue;
    const target = resolve(destination, relative);
    if (!target.startsWith(resolve(destination) + '\\') && !target.startsWith(resolve(destination) + '/')) {
      throw new Error(`refusing path traversal in tar entry ${fullName}`);
    }
    if (type === '5') {
      mkdirSync(target, { recursive: true });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
    written += 1;
  }
  return written;
}

async function main() {
  const ref = await resolveRef(process.argv[2]);
  const tarballResponse = await fetch(`https://codeload.github.com/${REPO}/tar.gz/${encodeURIComponent(ref)}`, {
    headers: { 'user-agent': 'coding-goal-verify' },
  });
  if (!tarballResponse.ok) throw new Error(`codeload ${ref} -> HTTP ${tarballResponse.status}`);
  const tar = gunzipSync(Buffer.from(await tarballResponse.arrayBuffer()));
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
  const files = extractTar(tar, outRoot);

  const stdout = [];
  const stderr = [];
  const realLog = console.log;
  const realError = console.error;
  const realExit = process.exit;
  let exitCode = 0;
  console.log = (...args) => stdout.push(args.join(' '));
  console.error = (...args) => stderr.push(args.join(' '));
  process.exit = (code = 0) => {
    exitCode = code;
    throw new Error(`__ACCEPT_EXIT_${code}__`);
  };
  try {
    await import(pathToFileURL(join(outRoot, 'tools', 'accept.mjs')).href + `?ref=${Date.now()}`);
  } catch (error) {
    if (!/^__ACCEPT_EXIT_\d+__$/.test(error?.message ?? '')) throw error;
  } finally {
    console.log = realLog;
    console.error = realError;
    process.exit = realExit;
  }

  const result = {
    repo: REPO,
    ref,
    files,
    candidateDir: outRoot,
    exitCode,
    verdict: exitCode === 0 ? 'PASS' : 'FAIL',
    stdout,
    stderr,
  };
  realLog(JSON.stringify(result, null, 2));
  realExit(exitCode === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`check-candidate: harness error: ${error?.stack ?? error}`);
  process.exit(2);
});
