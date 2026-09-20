import { defineRailway, github, preserve, project, service } from "railway/iac";

/**
 * Railway deployment config, in Railway's Infrastructure-as-Code format.
 * Replaces the deprecated railway.json, which stops being read on
 * 2026-12-01.
 *
 * IaC here is DECLARATIVE: anything this file doesn't mention, Railway
 * removes. The first version of this file listed only the build and start
 * commands, and `railway config plan` offered to disconnect the GitHub
 * source and delete every environment variable on the service. Read the
 * plan before applying, every time.
 *
 * A fork changes three things: the repo on `github(...)`, and the two
 * names below. The project name has to match the Railway project; the
 * service name only has to be stable.
 */

/** Scopes this file to its own service, so adding a database or a second
 *  service in the dashboard isn't reverted the next time this is applied. */
export const partial = "golf-trip";

export default defineRailway(() => {
  const app = service("golf-trip", {
    source: github("SchenkTech/golf-trip"),

    // The BUILD step only. Railway runs the install itself from
    // package-lock.json, in its own phase, with a cache mounted inside
    // node_modules -- adding `npm ci` here deletes that live mount and
    // fails the build with EBUSY. Learned on a real deploy.
    build: "npm run build",
    start: "npm start",
    healthcheck: "/api/health",
    healthcheckTimeout: 30,

    // Declared so IaC leaves them alone, with no values in source control.
    // Railway, unlike Render's blueprint, can't prompt for these -- set
    // them in the Variables tab or with `railway variables --set`. The app
    // exits at boot on the first one missing, which surfaces as a failed
    // healthcheck rather than an error message. See docs/DEPLOY.md.
    variables: {
      DATABASE_URL: preserve(),
      DATABASE_AUTH_TOKEN: preserve(),
      SESSION_SECRET: preserve(),
      NIXPACKS_NODE_VERSION: preserve(),
    },
  });

  return project("golf-trip", { resources: [app] });
});
