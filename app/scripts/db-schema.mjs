/**
 * Writes `prisma/schema.prisma` (`npm run db:schema`).
 *
 * The thinking lives in `prisma-schema.mjs`; this file only runs it. They are
 * separate on purpose: the previous version was one file that decided "am I
 * being run, or imported?" by comparing `import.meta.url` with
 * `file://${process.argv[1]}` — true on Linux, FALSE ON WINDOWS, where the
 * argument is `C:\dvfly\...` and the url is `file:///C:/dvfly/...`. The script
 * then did nothing, said nothing, and exited 0; the next command failed with
 * "Could not find Prisma Schema" and named a file nobody had been told was
 * generated. A file that exists to be run cannot be a file that guesses
 * whether it is being run.
 */
import { writeSchema } from './prisma-schema.mjs';

const { provider } = writeSchema();

// Saying what it wrote is not decoration: when this is silent, the failure
// lands two commands later, somewhere else.
console.log(`[dvfly] banco: ${provider} — prisma/schema.prisma escrito`);
