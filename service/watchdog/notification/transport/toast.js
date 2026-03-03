'use strict';

const notifier = require('node-notifier');
const os = require('os');
const path = require('path');

let toast;
if (os.platform() === 'win32') {
    toast = require('powertoast');
}

module.exports = async (message, options) => {
    if (os.platform() === 'win32') {
        let notification = {
            appID: options.toast.appid,
            timeStamp: message.time,
            title: message.achievementDisplayName,
            message: message.achievementDescription,
            icon: message.icon,
            silent: (options.toast.customAudio == 0) ? true : false,
            audio: (options.toast.customAudio == 2) ? "ms-winsoundevent:Notification.Achievement" : null,
            cropIcon: options.toast.cropIcon, 
        };
        
        if (message.achievementName){
            notification.uniqueID = `${message.appid}:${message.achievementName}`;
            notification.onClick = `ach:--appid ${message.appid} --name '${message.achievementName}'`;
        } else {
            notification.uniqueID = `${message.appid}`;
        }
        
        if (options.toast.attribution) notification.attribution = options.toast.attribution;
                
        if (options.toast.imageIntegration > 0 && message.image) {
            if (options.toast.imageIntegration == 1) {
                notification.headerImg = message.image;
            } else if (options.toast.imageIntegration == 2) {
                notification.footerImg = message.image;
            }
        }

        if(options.toast.group) notification.group = {id: message.appid, title: message.gameDisplayName};

        if(options.toast.winrt === false) notification.disableWinRT = true;
        
        if (message.progress && message.progress.max > 0) 
        {
            notification.progress = {
                percent: Math.floor( ( message.progress.current / message.progress.max ) * 100 ),
                footer: `${message.progress.current}/${message.progress.max}`
            };
        }

        await toast(notification);
    } else {
        // Linux implementation using node-notifier (libnotify)
        let notification = {
            title: message.achievementDisplayName,
            message: message.achievementDescription,
            icon: message.icon,
            sound: (options.toast.customAudio !== 0), // Simple boolean for sound
            wait: false
        };

        if (message.progress && message.progress.max > 0) {
             notification.message = `[ ${message.progress.current}/${message.progress.max} ]\n${message.achievementDescription}`;
        }
        
        // If image integration is requested and available, use it as icon if icon is not set or override?
        // libnotify uses icon for the main image usually.
        if (options.toast.imageIntegration > 0 && message.image) {
             notification.icon = message.image;
        }

        notifier.notify(notification);
    }
}