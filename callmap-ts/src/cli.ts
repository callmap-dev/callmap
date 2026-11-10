#!/usr/bin/env node
import { runCommand } from '@callmap/cli/src/command.ts';
import { CALLMAP_TS } from './callmap-ts.ts';

await runCommand(CALLMAP_TS);
