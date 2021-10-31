run:	
	cd cache && deno_bindgen
	deno run --no-check --location https://nest.land --allow-net=0.0.0.0:8080 --allow-read --allow-write --allow-env --allow-ffi --unstable twig.ts

test:
	-mv progress_cache.db progress_cache.db.bak
	RUST_BACKTRACE=full deno test -A --unstable --location https://nest.land

fmt:
	deno fmt
