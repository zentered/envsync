'use strict'

import fs from 'fs/promises'
import { readExample } from './lib/readExample.js'
import { joinEnv } from './lib/joinEnv.js'

const exampleFile = await fs.readFile('.env.example', 'utf8')
const env = await readExample(exampleFile)
await fs.writeFile('.env', joinEnv(env))
