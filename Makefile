run:	
	deno run --location https://nest.land --allow-net=0.0.0.0:8080 --allow-read --allow-write --allow-env twig.ts

test:
	RUST_BACKTRACE=full deno test -A --location https://nest.land

fmt:
	deno fmt
