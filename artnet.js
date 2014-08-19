/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

var artnet = require('artnet');

var objects = {};

var adapter = require(__dirname + '/../../lib/adapter.js')({

    name:           'artnet',

    objectChange: function (id, obj) {
        objects[id] = obj;
    },

    stateChange: function (id, state) {

        adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

        if (!state.ack && objects[id].native && objects[id].native.channel) {
            console.log('artnet.send', objects[id].native.channel, state.val);
            artnet.send(objects[id].native.channel, state.val, function () {
                adapter.setState(id, {ack: true});
            });
        }

    },

    unload: function (callback) {
        artnet.close();
        callback();
    },

    ready: function () {

        artnet.connect(adapter.config.host, adapter.config.port, adapter.config.universe);

        adapter.subscribeStates('*');
        adapter.subscribeObjects('*');

    }

});

