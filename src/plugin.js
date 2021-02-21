figma.showUI(__html__, { 
    width: 600,
    height: 400
});
const selection = figma.currentPage.selection[0];
const findAdditionalStagesAndPush = (frame, rootElement) => {
    if (frame === rootElement) {
        return [];
    }
    const stages = [frame];
    const targetReaction = frame.reactions.find(reaction => reaction.action.type === "NODE");
    const targetAction = targetReaction && targetReaction.action;
    if (targetAction) {
        const node = figma.getNodeById(targetAction.destinationId);
        return [].concat(stages, findAdditionalStagesAndPush(node, rootElement || frame));
    }
    return stages;
};
const stages = findAdditionalStagesAndPush(selection);

const getSVGForNode = node => node.exportAsync({ format: "SVG", svgIdAttribute: true })
    .then(Utf8ArrayToStr);
const convertSVGsToDOM = svgStrings => {
    return new Promise(resolve => {
        figma.ui.onmessage = message => {
            console.log(message);
            resolve(message);
        };
        figma.ui.postMessage({ type: "parse-request", data: svgStrings });
    });
};
Promise.all(stages.map(getSVGForNode))
    .then(convertSVGsToDOM);
// http://www.onicos.com/staff/iz/amuse/javascript/expert/utf.txt
/* utf.js - UTF-8 <=> UTF-16 convertion
 *
 * Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
 * Version: 1.0
 * LastModified: Dec 25 1999
 * This library is free.  You can redistribute it and/or modify it.
 */
function Utf8ArrayToStr(array) {
    var out, i, len, c;
    var char2, char3;
    out = "";
    len = array.length;
    i = 0;
    while (i < len) {
        c = array[i++];
        switch (c >> 4) {
            case 0:
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
            case 6:
            case 7:
                // 0xxxxxxx
                out += String.fromCharCode(c);
                break;
            case 12:
            case 13:
                // 110x xxxx   10xx xxxx
                char2 = array[i++];
                out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
                break;
            case 14:
                // 1110 xxxx  10xx xxxx  10xx xxxx
                char2 = array[i++];
                char3 = array[i++];
                out += String.fromCharCode(((c & 0x0F) << 12) |
                    ((char2 & 0x3F) << 6) |
                    ((char3 & 0x3F) << 0));
                break;
        }
    }
    return out;
}
