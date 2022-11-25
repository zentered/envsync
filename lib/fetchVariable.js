'use strict'

import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
const client = new SecretManagerServiceClient()

export async function fetchVariable(projectId, key, value) {
  const [secretName, version] = value.replace('envsync//', '').split('/')
  const [accessResponse] = await client.accessSecretVersion({
    name: `projects/${projectId}/secrets/${secretName}/versions/${
      version ? version : 'latest'
    }`
  })

  return [key, accessResponse.payload.data.toString('utf8')]
}
