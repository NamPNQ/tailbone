/**
 * @author Doug Fritz dougfritz@google.com
 * @author Maciej Zasada maciej@unit9.com
 * Date: 6/2/13
 * Time: 11:28 PM
 */

/**
 * Internal Node utility functions
 * @type {{PROTECTED_EVENTS: Array, uidSeed: number, remoteBindsByNodeIds: {}, send: Function, acknowledgeRemoteBind: Function, acknowledgeRemoteUnbind: Function, doesRemoteBindTo: Function}}
 */
var NodeUtils = {

    PROTECTED_EVENTS: ['open', 'exist', 'enter', 'leave', 'bind', 'unbind'],

    uidSeed: 1,
    remoteBindsByNodeIds: {},

    send: function (node, message) {

        var i;

        for (i = node._channels.length - 1; i > -1; --i) {

            if (node._channels[i].send(message)) {

                break;

            }

        }

    },

    acknowledgeRemoteBind: function (nodeId, type) {

        NodeUtils.remoteBindsByNodeIds[nodeId] = NodeUtils.remoteBindsByNodeIds[nodeId] || [];

        if (NodeUtils.remoteBindsByNodeIds[nodeId].indexOf(type) === -1) {

            NodeUtils.remoteBindsByNodeIds[nodeId].push(type);

        }

    },

    acknowledgeRemoteUnbind: function (nodeId, type) {

        var index;

        if (NodeUtils.remoteBindsByNodeIds[nodeId] && (index = NodeUtils.remoteBindsByNodeIds[nodeId].indexOf(type))) {

            NodeUtils.remoteBindsByNodeIds[nodeId].splice(index, 1);

        }

    },

    doesRemoteBindTo: function (nodeId, type) {

        return NodeUtils.remoteBindsByNodeIds[nodeId] && NodeUtils.remoteBindsByNodeIds[nodeId].indexOf(type) !== -1;

    }

};

/**
 * Node
 * @param mesh {Mesh} Mesh to which the node belongs
 * @param id {string} Node ID
 * @constructor
 */
var Node = function (mesh, id) {

    StateDrive.call(this);

    var uid = NodeUtils.uidSeed++;
    this.__defineGetter__('uid', function () {
        return uid;
    });
    this.mesh = mesh;
    this.id = id;
    this._channels = [];

};

/**
 * Extend StateDrive
 * @type {StateDrive}
 */
Node.prototype = new StateDrive();

/**
 * Returns unique Node string representation.
 * Essential to make dictionary indexing by Node work.
 * @returns {string}
 */
Node.prototype.toString = function () {

    return 'Node@' + this.uid;

};

/**
 * Connects to remote node
 */
Node.prototype.connect = function () {

    var self = this;

    if (this._channels.length === 0) {

        this._channels.push(new SocketChannel(this.mesh.self, this));
        this._channels.push(new RTCChannel(this.mesh.self, this));

    }

    this._channels.forEach(function (channel) {

        channel.bind('open', function () {

            StateDrive.prototype.trigger.call(self, 'open', channel);

        });

        channel.bind('message', function (message) {

            StateDrive.prototype.trigger.apply(self, self.preprocessIncoming.apply(self, message));

        });

        channel.open();

    });

};

/**
 * Disconnects node
 */
Node.prototype.disconnect = function () {

    this._channels.forEach(function (channel) {

        channel.unbind('message');
        channel.close();

    });

};

/**
 * Binds an event on the remote node
 * @param type {string}
 * @param handler {function}
 */
Node.prototype.bind = function (type, handler) {

    StateDrive.prototype.bind.apply(this, arguments);

    if (NodeUtils.PROTECTED_EVENTS.indexOf(type) === -1) {

        NodeUtils.send(this, '["bind","' + type + '"]');

    }

};

/**
 * Unbinds event from the remote node
 * @param type {string}
 * @param handler {function}
 */
Node.prototype.unbind = function (type, handler) {

    StateDrive.prototype.unbind.apply(this, arguments);

    if (NodeUtils.PROTECTED_EVENTS.indexOf(type) === -1) {

        NodeUtils.send(this, '["unbind","' + type + '"]');

    }

};

/**
 * Triggers remotely on the node
 * @param type
 * @param args
 */
Node.prototype.trigger = function (type, args) {

    var message;

    if (!NodeUtils.doesRemoteBindTo(this.id, type)) {

        return;

    }

    try {

        message = JSON.stringify(Array.prototype.slice.apply(this.preprocessOutgoing.apply(this, arguments)));
        if (message === 'null') {
            return;
        }

    } catch (e) {

        throw new Error('Trigger not serializable');

    }

    NodeUtils.send(this, message);

};

/**
 * Pre-processes incoming event before passing it on to the event pipeline
 * @param from {string} from ID
 * @param timestamp {int} timestamp
 * @returns data {array} data
 */
Node.prototype.preprocessIncoming = function (from, timestamp, data) {

    var eventArguments = Array.prototype.slice.apply(arguments).slice(2)[0],
        type = eventArguments[0],
        parsedArguments = [],
        i;

    switch (type) {

        case 'exist':
        case 'enter':
        case 'leave':
            parsedArguments.push(type);
            for (i = 1; i < eventArguments.length; ++i) {
                parsedArguments.push(new Node(this.mesh, eventArguments[i]));
            }
            break;

        case 'bind':
            NodeUtils.acknowledgeRemoteBind(from, eventArguments[1]);
            parsedArguments = eventArguments;
            break;

        case 'unbind':
            NodeUtils.acknowledgeRemoteUnbind(from, eventArguments[1]);
            parsedArguments = eventArguments;
            break;

        default:
            parsedArguments = eventArguments;
            break;

    }

    return parsedArguments;

};

/**
 * Pre-processes outgoing events before sending them
 * @param type {string} event type
 * @param args {object...} event arguments
 * @returns {Arguments} processed message array ready to be sent
 */
Node.prototype.preprocessOutgoing = function (type, args) {

    if (NodeUtils.PROTECTED_EVENTS.indexOf(type) === -1) {

        return arguments;

    } else {

        throw new Error('Event type ' + type + ' protected');
    }

};