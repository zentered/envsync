# EnvSync

<p align="center">
  <img height="150" src=".github/assets/cloud-icon.jpeg">
</p>

<p align="center">
  <a href="https://github.com/zentered/envsync/actions/workflows/seocheck.yml"><img alt="Workflow Integration Test status" src="https://github.com/zentered/envsync/actions/workflows/seocheck.yml/badge.svg"></a>
  <a href="https://github.com/zentered/envsync/actions/workflows/test.yml"><img alt="Unit Test status" src="https://github.com/zentered/envsync/actions/workflows/test.yml/badge.svg"></a>
  <a href="https://github.com/zentered/envsync/actions/workflows/publish.yml"><img alt="Unit Test status" src="https://github.com/zentered/envsync/actions/workflows/publish.yml/badge.svg"></a>
  <a href="https://semantic-release.gitbook.io/semantic-release/"><img alt="Semantic Release bagde" src="https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg"></a>
  <a href="https://zentered.co"><img alt="Semantic Release bagde" src="https://img.shields.io/badge/>-Zentered-lightgrey?style=flat"></a>
</p>

`EnvSync` is an attempt to make it easier for developers to initialize an
environment or update environment variables with on a single source of truth.

`EnvSync` currently works with Google Cloud Platform (Secrets Manager). It reads
the environment configuration from an `.env.example` file that is commonly used
to help developers get started with a new project, fetches the values from the
Google Cloud Platform (Secrets Manager) and writes them to a `.env` file.

For example, if you have the following `.env.example` file:

```bash
GCP_PROJECT=myproject-dev
NODE_ENV=development
API_URL=http://localhost:3000

AUTH0_CLIENT_SECRET=envsync//auth0-api-client-secret/latest
```

Will write the following `.env` file:

```bash
GCP_PROJECT=myproject-dev
NODE_ENV=development
API_URL=http://localhost:3000

AUTH0_CLIENT_SECRET=secret-value-from-gcp-project
```

**Important**: The first variable in the example should be `GCP_PROJECT` as
we're using that to determine the right project. A `keyfile.json`
([Create and manage service account keys](https://cloud.google.com/iam/docs/creating-managing-service-account-keys))
is required in the same folder as the `.env.example` file.

### Installation & Usage

```bash
    npm install @zentered/envsync
```

`EnvSync` is a CLI tool. You can run it with `npx envsync` or add it as a
`script` in `package.json`:

```json
{
  "scripts": {
    "envsync": "envsync"
  }
}
```

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).
