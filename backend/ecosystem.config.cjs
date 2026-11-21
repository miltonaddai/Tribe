/**
 * PM2 process definition, read by Colyseus Cloud at deploy time.
 *
 * `.cjs`, not `.js`, and deliberately so: package.json declares
 * `"type": "module"`, which makes every bare `.js` file in this directory an ES
 * module. PM2 loads this config with `require()`, and requiring an ES module
 * throws - the file would exist and still fail with "module is not defined in
 * ES module scope". The explicit `.cjs` extension opts this one file back into
 * CommonJS without changing how the server itself is loaded.
 *
 * The app runs through tsx rather than from compiled output. The sources use
 * extensionless relative imports ("./rooms/WorldRoom"), which Node's ESM loader
 * will not resolve on its own, and @tribe/shared is published as raw TypeScript.
 * Emitting JavaScript would mean rewriting every import in the codebase first,
 * so tsx stays the runtime here and is a real dependency, not a dev one.
 */
module.exports = {
  apps: [
    {
      name: "tribe",

      // The local tsx shim, so this never depends on npx resolving anything at
      // start-up. Both tsx and typescript are in `dependencies` precisely
      // because a production install would otherwise prune them and leave this
      // path missing.
      script: "./node_modules/.bin/tsx",
      args: "src/index.ts",

      /**
       * ONE instance, on purpose.
       *
       * The world lives in this process's memory. `new Server({ transport })`
       * in src/index.ts is constructed with no presence and no driver, and
       * services/redis.ts only reports whether REDIS_URL is set - it wires
       * nothing up. A second instance would therefore be a second, separate
       * city: players would see different vehicles, homes and trades depending
       * on which process they happened to connect to, with nothing in the logs
       * to say why.
       *
       * Raise this only after Colyseus presence and the driver are actually
       * backed by Redis.
       */
      instances: 1,
      exec_mode: "fork",

      // Not wait_ready: that makes PM2 hold until the app calls
      // process.send("ready"), which this server never does. Setting it would
      // stall every deploy until it timed out.
      autorestart: true,
      max_restarts: 10,
      time: true,
      watch: false,

      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
