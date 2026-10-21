'use strict';

const toast = require("./transport/toast.js");
const gntp = require("./transport/gntp.js");
const prefetch = require("./prefetch.js");
const { broadcast } = require("../websocket.js");
const debug = require("../util/log.js");

/*
  option: {
    notify, prefetch, gntpLabel,
    transport: { toast, gntp, websocket },
    toast: { customAudio (0 silent, 1 default, 2 custom), audioFile, inGamePopup, inGameDuration, inGamePosition }
  }
*/
module.exports = async (message, option = {}) => {

	try{
		const options = {
			notify: option.notify != null ? option.notify : true,
			transport: {
				toast: option.transport?.toast != null ? option.transport.toast : true,
				gntp: option.transport?.gntp || false,
				websocket: option.transport?.websocket || false
			},
			toast: {
				customAudio: option.toast?.customAudio >= 0 && option.toast?.customAudio <= 2 ? option.toast.customAudio : 1,
				audioFile: option.toast?.audioFile || "",
				inGamePopup: option.toast?.inGamePopup !== false,
				inGameDuration: option.toast?.inGameDuration,
				inGamePosition: option.toast?.inGamePosition
			},
			gntpLabel: option.gntpLabel,
			prefetch : option.prefetch != null ? option.prefetch : true
		};

		if (!options.notify) return;

		if  (options.transport.websocket) {
			debug.log("Websocket broadcast");

			let notification = {
				appID: message.appid,
				game: message.gameDisplayName,
				achievement: message.achievementName,
				displayName: message.achievementDisplayName,
				description: message.achievementDescription,
				icon: message.icon,
				time: message.time
			};

			if (message.progress) notification.progress = message.progress;

			broadcast(notification)
		}

		if (options.prefetch && message.icon && /^https?:/.test(message.icon)) {
			debug.log(`Prefetching...`);
			message.icon = await prefetch(message.icon,message.appid);
		}

		if (options.transport.toast){
			debug.log("Toast notification");
			try{
				await toast(message,options)
			}catch(err){
				debug.error(err);
			}
		}
		else {
			debug.log("Toast notification is disabled > SKIPPING")
		}

		if (options.transport.gntp){
			debug.log("GNTP");
			try {
				if (await gntp.hasGrowl()) {
					debug.log("Sending GNTP Grrr!");

					let notification = {
						title: message.achievementDisplayName,
						message: message.achievementDescription,
						icon: message.icon
					};

					if (options.gntpLabel) notification.label = options.gntpLabel;

					if (message.progress) notification.message = `[ ${message.progress.current}/${message.progress.max} ]\n${message.achievementDescription}`;

					await gntp.send(notification)
				} else {
					debug.error("GNTP endpoint unreachable");
				}
			}catch(err){ debug.error(err) };

		} else {
			debug.log("GNTP notification is disabled > SKIPPING");
		}

	}catch(err){debug.log(err)}
}
