/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

var artnet;
var utils  = require(__dirname + '/lib/utils'); // Get common adapter utils

var states   = {};
var values   = {};
var channels = {};
var timers   = {};

function splitColor(rgb) {
    if (!rgb) rgb = '#000000';
    rgb = rgb.toString().toUpperCase();
    if (rgb[0] === '#') rgb = rgb.substring(1);
    if (rgb.length < 6) rgb = rgb[0] + rgb[0] + rgb[1] + rgb[1] + rgb[2] + rgb[2];
    var r = parseInt(rgb[0] + rgb[1], 16);
    var g = parseInt(rgb[2] + rgb[3], 16);
    var b = parseInt(rgb[4] + rgb[5], 16);

    if (rgb.length >= 8) {
        return [r, g, b, parseInt(rgb[6] + rgb[7], 16)];
    } else {
        return [r, g, b];
    }
}

function getColor(r, g, b) {
    r = r.toString(16).toUpperCase();
    if (r.length < 2) r = '0' + r;

    g = g.toString(16).toUpperCase();
    if (g.length < 2) g = '0' + g;

    b = b.toString(16).toUpperCase();
    if (b.length < 2) b = '0' + b;

    return '#' + r + g + b;
}

function getRgbValues(channel, callback) {
    var count = 0;
    if (states[channel + '.red'].value === undefined) {
        count++;
        adapter.getForeignState(channel + '.red', function (err, state) {
            states[channel + '.red'].value = state ? parseInt(state.val, 10) : 0;
            if (!--count && callback) callback();
        });
    }
    if (states[channel + '.green'].value === undefined) {
        count++;
        adapter.getForeignState(channel + '.green', function (err, state) {
            states[channel + '.green'].value = state ? parseInt(state.val, 10) : 0;
            if (!--count && callback) callback();
        });
    }
    if (states[channel + '.blue'].value === undefined) {
        count++;
        adapter.getForeignState(channel + '.blue', function (err, state) {
            states[channel + '.blue'].value = state ? parseInt(state.val, 10) : 0;
            if (!--count && callback) callback();
        });
    }
    if (!count && callback) callback();
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
        artnet.set(adapter.config.universe, options.channel, options.end, function () {
            if (callback) callback();
            callback = null;
        });
        return;
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
    var value = options.start + options.stepVal * options.index;
    options.index++;
    if ((options.start > options.end && value <= options.end) || (options.start <= options.end && value >= options.end)) {
        adapter.log.debug('End control: channel - ' + options.channel + ', value - ' + options.end);
        artnet.set(adapter.config.universe, options.channel, options.end, function () {
            timers[options.channel] = null;
            if (callback) callback();
            callback = null;
        });
    } else {
        adapter.log.debug('Control: channel - ' + options.channel + ', value - ' + value);
        artnet.set(adapter.config.universe, options.channel, value, function () {
            timers[options.channel] = setTimeout(setDelayed, options.stepTime, options, callback);
        });
    }
}

var adapter = utils.adapter({

    name:           'artnet',

    objectChange: function (id, obj) {
        if (obj) {
            if (obj.type === 'states') {
                states[id] = obj;
            } else {
                channels[id] = obj;
            }
        } else {
            if (states[id])   delete states[id];
            if (channels[id]) delete channels[id];
        }
    },

    stateChange: function (id, state) {
        if (state && !state.ack && states[id].native && states[id].native.channel) {
            adapter.log.debug('artnet.set', states[id].native.channel, state.val);

            if (states[id].common.role === 'level.rgb') {
                var rgb = splitColor(state.val);
                var parts = id.split('.');
                parts.pop();
                var channel = parts.join('.');
                states[channel + '.red'].value   = rgb[0];
                states[channel + '.green'].value = rgb[1];
                states[channel + '.blue'].value  = rgb[2];

                artnet.set(adapter.config.universe, states[channel + '.red'].native.channel, rgb[0], function () {
                    adapter.setForeignState(channel + '.red', {val: rgb[0], ack: true});
                    artnet.set(adapter.config.universe, states[channel + '.green'].native.channel, rgb[1], function () {
                        adapter.setForeignState(channel + '.green', {val: rgb[1], ack: true});
                        artnet.set(adapter.config.universe, states[channel + '.blue'].native.channel, rgb[2], function () {
                            adapter.setForeignState(channel + '.blue', {val: rgb[2], ack: true});
                            adapter.setForeignState(id, {val: getColor(rgb[0], rgb[1], rgb[2]), ack: true});
                        });
                    });
                });
            } else {
                if (state.val === 'true')  state.val = true;
                if (state.val === 'false') state.val = false;

                var originalValue = state.val;

                if (states[id].native.value_off !== undefined && (state.val === false || state.val === 'false')) state.val = states[id].native.value_off;
                if (states[id].native.value_on  !== undefined && (state.val === true  || state.val === 'true'))  state.val = states[id].native.value_on;

                var oldValue = null;
                if (values[id]) {
                    oldValue = values[id].val;
                    if (states[id].native.value_off !== undefined && (oldValue === false || oldValue === 'false')) oldValue = states[id].native.value_off;
                    if (states[id].native.value_on  !== undefined && (oldValue === true  || oldValue === 'true'))  oldValue = states[id].native.value_on;
                }

                state.val = parseInt(state.val, 10) || 0;

                var parts = id.split('.');
                parts.pop();
                var channelId = parts.join('.');

                setDelayed({
                    channel:  states[id].native.channel,
                    min:      states[id].common.min,
                    max:      states[id].common.max,
                    start:    oldValue,
                    end:      state.val,
                    interval: channels[channelId] ? channels[channelId].native.interval : 0
                }, function () {
                    adapter.setForeignState(id, {val: originalValue, ack: true});
                    values[id] = state;

                    var parts = id.split('.');
                    var color = parts.pop();
                    var channel = parts.join('.');
                    if (states[channel + '.rgb']) {
                        states[channel + '.' + color].value = state.val;
                        getRgbValues(channel, function () {
                            adapter.setForeignState(channel + '.rgb', getColor(states[channel + '.red'].value, states[channel + '.green'].value, states[channel + '.blue'].value), true);
                        });
                    }
                });
            }
        }
    },

    unload: function (callback) {
        if (artnet) {
            try {
                artnet.close();
            } catch (err) {
                if (adapter && adapter.log) adapter.log.debug('Cannot close: ' + err);
            }
        }
        callback();
    },

    ready: function () {
        adapter.config.universe = parseInt(adapter.config.universe, 10) || 0;

        artnet = require('artnet')({host: adapter.config.host, port: parseInt(adapter.config.port, 10) || 6454});

        adapter.subscribeStates('*');
        adapter.subscribeObjects('*');

        adapter.objects.getObjectView('system', 'state', {startkey: adapter.namespace + '.', endkey: adapter.namespace + '.\u9999', include_docs: true}, function (err, res) {
            adapter.objects.getObjectView('system', 'channel', {startkey: adapter.namespace + '.', endkey: adapter.namespace + '.\u9999', include_docs: true}, function (err, _channels) {
                if (_channels) {
                    for (var i = _channels.rows.length - 1; i >= 0; i--) {
                        channels[_channels.rows[i].id] = _channels.rows[i].value;
                    }
                }

                adapter.getStates('*', function (err, _states) {
                    values = _states;
                    if (err) {
                        adapter.log.error('Cannot get states: ' + err);
                    } else {
                        for (var i = res.rows.length - 1; i >= 0; i--) {
                            states[res.rows[i].id] = res.rows[i].value;
                        }
                    }
                });
            });
        });
    }
});

