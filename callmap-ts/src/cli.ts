#!/usr/bin/env node
import { runCommand } from './command.ts';
import { CALLMAP_TS } from './callmap-ts.ts';

await runCommand(CALLMAP_TS);
