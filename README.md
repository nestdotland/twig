## `twig`

Twig is nest.land's work-in-progress module publishing service written in Deno.

### Setup

First, Setup environment variables:

```
# .env

# For `make`
SUPABASE_URL="<supabase api url>"
SUPABASE_API_KEY="<supabase api key>"
KEYFILE="<path to arweave wallet>"

# For `make test`
TEST_TAG_ID="<tag id>"
TEST_ACCESS_TOKEN="<access token hash>"
```

Start the server with `make` on localhost port 8080.

To run the test suite, ensure `TEST_TAG_ID` and `TEST_ACCESS_TOKEN` match the
desired assertions and run with `make test`.

### Usage

See [`twig_test.ts`](./twig_test.ts) for an example for uploading a module and
retrieving progress.
