import {getCache} from '@vercel/functions';
import {getGoogleDriveReadAccessToken} from './_google-drive.js';
import {makeDriveRead} from './_sl-drive-read.js';
import {makeSLLiveHandler} from './_sl-live-handler.js';
import {makeLiveSL} from './_sl-live-cache.js';
import columns from './_sl-columns.js';
const drive=makeDriveRead(getGoogleDriveReadAccessToken);
const live=makeLiveSL({drive,cache:getCache(),secret:process.env.AI_ROTATOR_BRIDGE_TOKEN,columns});
export default makeSLLiveHandler({...live,metadata:drive.metadata});
