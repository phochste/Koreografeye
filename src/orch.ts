import * as fs from 'fs';
import * as tmp from 'tmp';
import * as log4js from 'log4js';
import { program } from 'commander';
import { spawn} from 'node:child_process';
import { parseAsN3Store, rdfTransformStore , topGraphIds , injectMainSubject} from './util';

const eye = '/usr/local/bin/eye';

program.version('0.0.1')
       .argument('<data>')
       .argument('<rules>')
       .option('-d,--info','output debugging messages')
       .option('-dd,--debug','output more debugging messages')
       .option('-ddd,--trace','output much more debugging messages');

program.parse(process.argv);

const opts   = program.opts();
const logger = log4js.getLogger();

if (opts.info) {
    logger.level = "info";
}
if (opts.debug) {
    logger.level = "debug";
}
if (opts.trace) {
    logger.level = "trace";
}

const data  = program.args[0];
const rules = program.args.slice(1);

logger.info(`data: ${data}`);
logger.info(`rules: ${rules}`);

main(data,rules);

async function main(data: string, rules: string[]) {
    const result = await reason(data,rules);
    console.log(result);
}

async function reason(dataPath: string , rulePaths: string[]) {
    return new Promise( async (resolve,reject) =>  {
        logger.trace(`parsing ${dataPath}...`);
        const store = await parseAsN3Store(dataPath);

        if (!store) {
            reject(`failed to create a store from ${dataPath}`);
        }

        const topIds = topGraphIds(store);

        if (topIds.length != 1) {
            reject(`document doesn't contain one main subject`);
        }

        // Inject a top graph indicator in the KG
        injectMainSubject(store,topIds[0]);

        const n3  = await rdfTransformStore(store, 'text/turtle');

        if (!n3) {
            reject(`failed to transform store to turtle`);
        }

        logger.trace(n3);

        const tmpobj = tmp.fileSync();

        if (! tmpobj) {
            reject(`failed to creat tmp object`);
        }

        logger.trace(`tmp file: ${tmpobj.name}`);

        logger.debug(`writing n3 to ${tmpobj.name}`);
        fs.writeFileSync(tmpobj.name, n3);

        const args = ['--quiet','--nope','--pass'];
        args.push(tmpobj.name);
        rulePaths.forEach(r => args.push(r));

        logger.info(`${eye}`);
        logger.info(`eye args: ${args}`);

        let errorData = '';
        let resultData = '';

        const ls = spawn(eye,args);
        ls.stdout.on('data', (data) => {
            resultData += data;
        });
        ls.stderr.on('data', (data) => {
            errorData += data;
        });
        ls.on('close', (code) => {
            tmpobj.removeCallback();
            if (code != 0) {
                reject(errorData);
            }
            else {
                resolve(resultData);
            }
        });
    });
}