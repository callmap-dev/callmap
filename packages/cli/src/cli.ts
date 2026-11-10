#!/usr/bin/env node
import { CALLMAP } from './callmap.ts';
import { runCommand } from './command.ts';

await runCommand(CALLMAP);
