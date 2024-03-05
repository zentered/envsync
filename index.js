#!/usr/bin/env node

'use strict'

import fs from 'fs/promises'
import { readExample } from './lib/readExample.js'
import { joinEnv } from './lib/joinEnv.js'

const args = process.argv.slice(2);
const filePath = args[0] || '.env.example'

const exampleFile = await fs.readFile(filePath, 'utf8')
const env = await readExample(exampleFile)
const output = filePath.replace(".example", "")
await fs.writeFile(output, joinEnv(env))
