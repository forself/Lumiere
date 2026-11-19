import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {parseBuilding} from '../src/frontend/designer/building-model.js';
import {drawingPdf} from '../src/frontend/designer/drawings.js';
mkdirSync('output/pdf',{recursive:true});writeFileSync('output/pdf/design-drawing-set.pdf',drawingPdf(parseBuilding(readFileSync('output/elements-test.json','utf8'))));
