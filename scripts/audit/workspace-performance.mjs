import {writeFileSync,mkdirSync} from 'node:fs';
import {runScenarios} from '../../tests/helpers/workspace-performance.mjs';
const baseline=process.argv[2]||'416d24ed867971449133d02ca12faf24a714ef60';
const report={baseline,method:'Actual TSX callbacks and effects with simulated API responses; request counts, not browser timings.',before:await runScenarios(baseline),after:await runScenarios()};
mkdirSync('outputs',{recursive:true});writeFileSync('outputs/workspace-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
