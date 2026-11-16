'use strict';
if (process.argv[3] === 'flood') process.stdout.write('x'.repeat(4096));
else setInterval(() => {}, 1000);
