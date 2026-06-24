### Building and running your application

This is a Next.js app built with [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
via a multi-stage Dockerfile (deps → build → minimal runner).

Make sure `.env.local` exists (copy from `.env.example` and fill it in), then run:

```
docker compose --env-file .env.local up --build
```

`--env-file .env.local` is required: the `NEXT_PUBLIC_*` values are inlined into
the client bundle at **build time**, so Compose needs them to populate the build
args. The same file is also injected into the running container for the
server-only secrets (service role key, Stripe, Paymob, Upstash, Sentry, …).

Your application will be available at http://localhost:3000.

### Deploying your application to the cloud

First, build your image, e.g.: `docker build -t myapp .`.
If your cloud uses a different CPU architecture than your development
machine (e.g., you are on a Mac M1 and your cloud provider is amd64),
you'll want to build the image for that platform, e.g.:
`docker build --platform=linux/amd64 -t myapp .`.

Then, push it to your registry, e.g. `docker push myregistry.com/myapp`.

Consult Docker's [getting started](https://docs.docker.com/go/get-started-sharing/)
docs for more detail on building and pushing.

### References
* [Docker's Node.js guide](https://docs.docker.com/language/nodejs/)