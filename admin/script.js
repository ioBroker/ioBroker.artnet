
function load(settings) {
    for (var key in settings) {
        $('#' + key + '.value').val(settings[key]);
    }
}

function save(callback) {
    var obj = {};
    $('.value').each(function () {
        var $this = $(this);
        obj[$this.attr('id')] = $this.val();
    });
    callback(obj);
}



$(document).ready(function () {
    var fixtures = {};

    socket.emit('getObjectView', 'system', 'meta', {startkey: 'artnet.meta.', endkey: 'artnet.meta.\u9999', include_docs: true}, function (err, res) {
        for (var i = 0; i < res.rows.length; i++) {
            var row = res.rows[i];
            fixtures[row.id] = row.doc;
            $('#fixture').append('<option value="' + row.id + '">' + row.doc.common.name + '</option>');
        }
    });



    $('#tabs').tabs();
    $('#dialog-fixture').dialog({
        autoOpen: false,
        width: 400,
        height: 300,
        modal: true,
        buttons: {
            "Add device": function() {
                var name =      $('#name').val();
                var fixture =   fixtures[$('#fixture').val()];
                var count =     $('#fixture-count').val();
                var first =     $('#first-address').val();

                var deviceObj = fixture.native.channel;
                var deviceId = 'artnet.' + instance + '.' + $('#fixture').val().split('.').pop() + '.' + first;

                deviceObj._id = deviceId;

                deviceObj.common.name = name || deviceId;
                deviceObj.children = [];

                var objs = fixture.native.states;

                for (var i = 0; i < objs.length; i++) {
                    var dpType = objs[i].common.role.split('.').pop();

                    var id = deviceId + '.' + dpType;
                    objs[i].common.name = name ? name + ' ' + dpType : id;
                    objs[i].parent = deviceId;
                    objs[i]._id = id;
                    objs[i].native.channel = first++;
                    deviceObj.children.push(id);

                }

                objs.push(deviceObj);

                function insertObjs() {
                    if (objs.length < 1) {
                        console.log('done');
                        $('#dialog-fixture').dialog('close');
                    } else {
                        var obj = objs.pop();
                        console.log(obj._id);
                        socket.emit('setObject', obj._id, obj, function () {
                            insertObjs();
                        });
                    }
                }

                insertObjs();

            },
            Cancel: function() {
                $( this ).dialog( "close" );
            }
        }
    });
    $('#grid-devices').jqGrid({
        datatype: 'local',
        colNames: ['id', 'name', 'type', 'address'],
        colModel: [
            {name: '_id',  index:'_id'},
            {name: 'name', index:'name'},
            {name: 'type', index:'type'},
            {name: 'address', index:'address'}
        ],
        pager: $('#pager-devices'),
        width: 760,
        height: 280,
        rowNum: 100,
        rowList: [20, 50, 100],
        sortname: "id",
        sortorder: "desc",
        viewrecords: true,
        caption: 'DMX Devices',
        subGrid: true,
        gridComplete: function () {
            $('#del-object').addClass('ui-state-disabled');
            $('#edit-object').addClass('ui-state-disabled');
        }
    }).jqGrid('filterToolbar', {
        defaultSearch: 'cn',
        autosearch: true,
        searchOnEnter: false,
        enableClear: false
    }).navGrid('#pager-devices', {
        search: false,
        edit: false,
        add: false,
        del: false,
        refresh: false
    }).jqGrid('navButtonAdd', '#pager-devices', {
        caption: '',
        buttonicon: 'ui-icon-trash',
        onClickButton: function () {
        },
        position: 'first',
        id: 'del-device',
        title: 'Delete device',
        cursor: 'pointer'
    }).jqGrid('navButtonAdd', '#pager-devices', {
        caption: '',
        buttonicon: 'ui-icon-pencil',
        onClickButton: function () {
        },
        position: 'first',
        id: 'edit-device',
        title: 'Edit device',
        cursor: 'pointer'
    }).jqGrid('navButtonAdd', '#pager-devices', {
        caption: '',
        buttonicon: 'ui-icon-plus',
        onClickButton: function () {
            $('#fixture-count').val('1');
            $('#first-address').val('1');
            $('#dialog-fixture').dialog('open');

        },
        position: 'first',
        id: 'add-device',
        title: 'Add Device',
        cursor: 'pointer'
    });


    socket.emit('getObjectView', 'system', 'channel', {startkey: 'artnet.' + instance + '.', endkey: 'artnet.' + instance + '.\u9999', include_docs: true}, function (err, res) {
        for (var i = 0; i < res.rows.length; i++) {
            var row = res.rows[i];
            row.doc.name = row.doc.common.name;
            if (row.doc.type === 'state') {
                row.doc.address = row.doc.native.channel;
            }

            $('#grid-devices').jqGrid('addRowData', row.id, row.doc);
        }
    });


});