import {getGoogleDriveReadAccessToken} from './_google-drive.js';
import {makeDriveRead} from './_sl-drive-read.js';
import {makeSLLiveHandler} from './_sl-live-handler.js';
export default makeSLLiveHandler(makeDriveRead(getGoogleDriveReadAccessToken));
