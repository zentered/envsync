'use strict'

export function joinEnv(env) {
  return env
    .map(([key, value]) => {
      if (key !== '') {
        return `${key}=${value}`
      }
    })
    .join('\n')
}
