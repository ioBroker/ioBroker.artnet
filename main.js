/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const utils       = require('@iobroker/adapter-core'); // Get common adapter utils
const adapterName = require('./package.json').name.split('.').pop();

let artnet;
const states   = {};
let values   = {};
const channels = {};
const timers   = {};
let adapter;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: adapterName,
        objectChange: (id, obj) => {
            if (obj) {
                if (obj.type === 'states') {
                    states[id] = obj;
                } else {
                    channels[id] = obj;
                }
            } else {
                if (states[id]) {
                    delete states[id];
                }
                if (channels[id]) {
                    delete channels[id];
                }
            }
        },

        stateChange: (id, state) => {
            if (state && !state.ack && states[id].native && states[id].native.channel) {
                adapter.log.debug('artnet.set', states[id].native.channel, state.val);

                if (states[id].common.role === 'level.color.rgb') {
                    const rgb = splitColor(state.val);
                    const parts = id.split('.');
                    parts.pop();
                    const channel = parts.join('.');
                    states[channel + '.red'].value   = rgb[0];
                    states[channel + '.green'].value = rgb[1];
                    states[channel + '.blue'].value  = rgb[2];

                    artnet.set(adapter.config.universe, states[channel + '.red'].native.channel, rgb[0], () => {
                        adapter.setForeignState(channel + '.red', {val: rgb[0], ack: true});
                        artnet.set(adapter.config.universe, states[channel + '.green'].native.channel, rgb[1], () => {
                            adapter.setForeignState(channel + '.green', {val: rgb[1], ack: true});
                            artnet.set(adapter.config.universe, states[channel + '.blue'].native.channel, rgb[2], () => {
                                adapter.setForeignState(channel + '.blue', {val: rgb[2], ack: true});
                                adapter.setForeignState(id, {val: getColor(rgb[0], rgb[1], rgb[2]), ack: true});
                            });
                        });
                    });
                } else {
                    if (state.val === 'true') {
                        state.val = true;
                    }
                    if (state.val === 'false') {
                        state.val = false;
                    }

                    const originalValue = state.val;

                    if (states[id].native.value_off !== undefined && (state.val === false || state.val === 'false')) {
                        state.val = states[id].native.value_off;
                    }
                    if (states[id].native.value_on  !== undefined && (state.val === true  || state.val === 'true'))  {
                        state.val = states[id].native.value_on;
                    }

                    let oldValue = null;
                    if (values[id]) {
                        oldValue = values[id].val;
                        if (states[id].native.value_off !== undefined && (oldValue === false || oldValue === 'false')) {
                            oldValue = states[id].native.value_off;
                        }
                        if (states[id].native.value_on  !== undefined && (oldValue === true  || oldValue === 'true')) {
                            oldValue = states[id].native.value_on;
                        }
                    }

                    state.val = parseInt(state.val, 10) || 0;

                    const parts = id.split('.');
                    parts.pop();
                    const channelId = parts.join('.');

                    setDelayed({
                        channel:  states[id].native.channel,
                        min:      states[id].common.min,
                        max:      states[id].common.max,
                        start:    oldValue,
                        end:      state.val,
                        interval: channels[channelId] ? channels[channelId].native.interval : 0
                    }, () => {
                        adapter.setForeignState(id, {val: originalValue, ack: true});
                        values[id] = state;

                        const parts = id.split('.');
                        const color = parts.pop();
                        const channel = parts.join('.');
                        if (states[channel + '.rgb']) {
                            states[channel + '.' + color].value = state.val;
                            getRgbValues(channel, () =>
                                adapter.setForeignState(channel + '.rgb', getColor(states[channel + '.red'].value, states[channel + '.green'].value, states[channel + '.blue'].value), true));
                        }
                    });
                }
            }
        },

        unload: callback => {
            if (artnet) {
                try {
                    artnet.close();
                } catch (err) {
                    adapter && adapter.log && adapter.log.debug('Cannot close: ' + err);
                }
            }
            callback();
        },

        ready: () => {
            adapter.config.universe = parseInt(adapter.config.universe, 10) || 0;

            artnet = require('artnet')({host: adapter.config.host, port: parseInt(adapter.config.port, 10) || 6454, sendAll: true});

            adapter.subscribeStates('*');
            adapter.subscribeObjects('*');

            adapter.getObjectView('system', 'state', {startkey: adapter.namespace + '.', endkey: adapter.namespace + '.\u9999', include_docs: true}, (err, res) =>
                adapter.getObjectView('system', 'channel', {startkey: adapter.namespace + '.', endkey: adapter.namespace + '.\u9999', include_docs: true}, (err, _channels) => {
                    if (_channels) {
                        for (let i = _channels.rows.length - 1; i >= 0; i--) {
                            channels[_channels.rows[i].id] = _channels.rows[i].value;
                        }
                    }

                    adapter.getStates('*', (err, _states) => {
                        values = _states;
                        if (err) {
                            adapter.log.error('Cannot get states: ' + err);
                        } else {
                            for (let i = res.rows.length - 1; i >= 0; i--) {
                                states[res.rows[i].id] = res.rows[i].value;
                            }
                        }
                    });
                }));
        }
    });
    
    adapter = new utils.Adapter(options);
    
    return adapter;
}

function splitColor(rgb) {
    if (!rgb) rgb = '#000000';
    rgb = rgb.toString().toUpperCase();
    if (rgb[0] === '#') {
        rgb = rgb.substring(1);
    }
    if (rgb.length < 6) {
        rgb = rgb[0] + rgb[0] + rgb[1] + rgb[1] + rgb[2] + rgb[2];
    }
    const r = parseInt(rgb[0] + rgb[1], 16);
    const g = parseInt(rgb[2] + rgb[3], 16);
    const b = parseInt(rgb[4] + rgb[5], 16);

    if (rgb.length >= 8) {
        return [r, g, b, parseInt(rgb[6] + rgb[7], 16)];
    } else {
        return [r, g, b];
    }
}

function getColor(r, g, b) {
    r = r.toString(16).toUpperCase();
    if (r.length < 2) {
        r = '0' + r;
    }

    g = g.toString(16).toUpperCase();
    if (g.length < 2) {
        g = '0' + g;
    }

    b = b.toString(16).toUpperCase();
    if (b.length < 2) {
        b = '0' + b;
    }

    return '#' + r + g + b;
}

function getRgbValues(channel, callback) {
    let count = 0;
    if (states[channel + '.red'].value === undefined) {
        count++;
        adapter.getForeignState(channel + '.red', (err, state) => {
            states[channel + '.red'].value = state ? parseInt(state.val, 10) : 0;
            !--count && callback && callback();
        });
    }
    if (states[channel + '.green'].value === undefined) {
        count++;
        adapter.getForeignState(channel + '.green', (err, state) => {
            states[channel + '.green'].value = state ? parseInt(state.val, 10) : 0;
            !--count && callback && callback();
        });
    }
    if (states[channel + '.blue'].value === undefined) {
        count++;
        adapter.getForeignState(channel + '.blue', (err, state) => {
            states[channel + '.blue'].value = state ? parseInt(state.val, 10) : 0;
            !--count && callback && callback();
        });
    }

    !count && callback && callback();
}

function setDelayed(options, callback) {
    if (options.interval && options.start === null) {
        // try to guess the old value
        if ((options.min !== undefined && parseInt(options.end, 10) !== parseInt(options.min, 10)) || parseInt(options.end, 10)) {
            options.start = options.min !== undefined ? options.min : 0;
        } else {
            options.start = options.max !== undefined ? options.max : 255;
        }
    }

    if (!options.interval || options.start === null) {
        adapter.log.debug('Set direct: channel - ' + options.channel + ', value - ' + options.end);
        return artnet.set(adapter.config.universe, options.channel, options.end, () => {
            callback && callback();
            callback = null;
        });
    }

    if (options.index === undefined) {
        options.index = 1;
        options.stepVal  = Math.round((options.end - options.start) / 30);
        options.stepTime = Math.round(options.interval / 30);
        if (options.stepTime < 15) {
            options.stepTime = 15;
            options.stepVal  = Math.round((options.end - options.start) / (options.interval / options.stepTime));
        }

        // stop previous process
        if (timers[options.channel]) {
            clearTimeout(timers[options.channel]);
            timers[options.channel] = null;
        }
    }
    const value = options.start + options.stepVal * options.index;

    options.index++;
    if ((options.start > options.end && value <= options.end) || (options.start <= options.end && value >= options.end)) {
        adapter.log.debug('End control: channel - ' + options.channel + ', value - ' + options.end);
        artnet.set(adapter.config.universe, options.channel, options.end, () => {
            timers[options.channel] = null;
            callback && callback();
            callback = null;
        });
    } else {
        adapter.log.debug('Control: channel - ' + options.channel + ', value - ' + value);
        artnet.set(adapter.config.universe, options.channel, value, () =>
            timers[options.channel] = setTimeout(setDelayed, options.stepTime, options, callback));
    }
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
