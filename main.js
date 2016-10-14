/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

var artnet;
var utils  = require(__dirname + '/lib/utils'); // Get common adapter utils

var objects = {};

function splitColor(rgb) {
    if (!rgb) rgb = '#000000';
    rgb = rgb.toString().toUpperCase();
    if (rgb[0] === '#') rgb = rgb.substring(1);
    if (rgb.length < 6) rgb = rgb[0] + rgb[0] + rgb[1] + rgb[1] + rgb[2] + rgb[2];
    var r = parseInt(rgb[0] + rgb[1], 16);
    var g = parseInt(rgb[2] + rgb[3], 16);
    var b = parseInt(rgb[4] + rgb[5], 16);

    return [r, g, b];
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
    if (objects[channel + '.red'].value === undefined) {
        count++;
        adapter.getForeignState(channel + '.red', function (err, state) {
            objects[channel + '.red'].value = state ? parseInt(state.val, 10) : 0;
            if (!--count && callback) callback();
        });
    }
    if (objects[channel + '.green'].value === undefined) {
        count++;
        adapter.getForeignState(channel + '.green', function (err, state) {
            objects[channel + '.green'].value = state ? parseInt(state.val, 10) : 0;
            if (!--count && callback) callback();
        });
    }
    if (objects[channel + '.blue'].value === undefined) {
        count++;
        adapter.getForeignState(channel + '.blue', function (err, state) {
            objects[channel + '.blue'].value = state ? parseInt(state.val, 10) : 0;
            if (!--count && callback) callback();
        });
    }
    if (!count && callback) callback();
}

var adapter = utils.adapter({

    name:           'artnet',

    objectChange: function (id, obj) {
        if (obj) {
            objects[id] = obj;
        } else {
            if (objects[id]) delete objects[id];
        }
    },

    stateChange: function (id, state) {
        adapter.log.debug('stateChange ' + id + ': ' + JSON.stringify(state));

        if (state && !state.ack && objects[id].native && objects[id].native.channel) {
            console.log('artnet.set', objects[id].native.channel, state.val);

            if (objects[id].common.role === 'level.rgb') {
                var rgb = splitColor(state.val);
                var parts = id.split('.');
                parts.pop();
                var channel = parts.join('.');
                objects[channel + '.red'].value   = rgb[0];
                objects[channel + '.green'].value = rgb[1];
                objects[channel + '.blue'].value  = rgb[2];
                artnet.set(adapter.config.universe, objects[channel + '.red'].native.channel, rgb[0], function () {
                    adapter.setForeignState(channel + '.red', {val: rgb[0], ack: true});
                    artnet.set(adapter.config.universe, objects[channel + '.green'].native.channel, rgb[1], function () {
                        adapter.setForeignState(channel + '.green', {val: rgb[1], ack: true});
                        artnet.set(adapter.config.universe, objects[channel + '.blue'].native.channel, rgb[2], function () {
                            adapter.setForeignState(channel + '.blue', {val: rgb[2], ack: true});
                            adapter.setForeignState(id, {val: getColor(rgb[0], rgb[1], rgb[2]), ack: true});
                        });
                    });
                });
            } else {
                if (state.val === 'true')  state.val = true;
                if (state.val === 'false') state.val = false;

                if (objects[id].native.value_off !== undefined && (state.val === false || state.val === 'false')) state.val = objects[id].native.value_off;
                if (objects[id].native.value_on  !== undefined && (state.val === true  || state.val === 'true'))  state.val = objects[id].native.value_on;

                state.val = parseInt(state.val, 10) || 0;
                artnet.set(adapter.config.universe, objects[id].native.channel, state.val, function () {
                    adapter.setForeignState(id, {val: state.val, ack: true});

                    var parts = id.split('.');
                    var color = parts.pop();
                    var channel = parts.join('.');
                    if (objects[channel + '.rgb']) {
                        objects[channel + '.' + color].value = state.val;
                        getRgbValues(channel, function () {
                            adapter.setForeignState(channel + '.rgb', getColor(objects[channel + '.red'].value, objects[channel + '.green'].value, objects[channel + '.blue'].value), true);
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
            if (err) {
                adapter.log.error('Cannot get objects: ' + err);
            } else {
                for (var i = res.rows.length - 1; i >= 0; i--) {
                    objects[res.rows[i].id] = res.rows[i].value;
                }
            }
        });
    }
});

