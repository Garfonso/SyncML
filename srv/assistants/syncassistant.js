var DeletedCalendarEvent = function DeletedCalendarEvent(localInfo) {
	log("DeletedCalendarEvent called with " + JSON.stringify(localInfo));
	//think what we need..
	this.item = {
		key: localInfo.remoteId
	};
	this.event = localInfo;
	this.isDeleted = true;
};


var SyncAssistant = Class.create(Sync.SyncCommand, {
	initialize: function () {
		log("SyncAssistant::initialize");
		this.tzManager = new Calendar.TimezoneManager();
	},
	
	run: function run(future) {
		log("SyncAssistant::run( " + JSON.stringify(future) + ")"); 
		var subFuture = this.tzManager.setup();
		subFuture.then(this, function (join) {
			log("\n\n----->>>>> SyncAssistant.run(): calling inherited ????");
			join.getResult();
			this.$super(run)(future);
		});
	},

	/*
	 * Returns a function which will transform between local and remote formats.
	 * The name describes which direction should be provided - currently supports
	 * local2remote and remote2local.  If local2remote is not supported, return undefined
	 * and this will become a readonly sync.
	 * The transformation function takes the form 'bool function(to, from)' and returns a
	 * defined value (of some sort) if the transform of from makes a change in 'to'.
	 */
	getTransformer: function(direction, kindName)
	{
		var transform,
			transformer,
			self = this;

		log("SyncAssistant::getTransformer.");
		log("direction = " + JSON.stringify(direction));
		log("kindName = " + JSON.stringify(kindName));
		if (direction === "remote2local") {
			if (kindName === Kinds.objects.calendar.name) {
				transform = Transforms[kindName] && Transforms[kindName][direction];
				if (transform) {
					transformer = new Json.Transformer(transform);
					return function (to, from) {
						log("\n-->> Transforming " + from.name + " (" + direction + ")");
						log("\n-->> To: " + stringify(to));
						log("\n-->> From: " + stringify(from));
						var t = transformer.transformAndMerge(to, from);
						log("\n-->> Transformed " + from.name + ": " + stringify(t));
						return t;
					};
				}
			} else if (kindName === Kinds.objects.calendarevent.name) {
				transform = Transforms[kindName] && Transforms[kindName][direction];
				if (transform) {
					return function (to, from) {
						log("\n\n\n");
						var summary = from.result.subject;

						log("\n\n");

						log("\n-->> Transforming " + summary + " (" + direction + ")");
						log("\n-->> To: " + stringify(to));
						log("\n-->> From: " + stringify(from));

						transform(to, from);

						log("\n-->> Transformed " + summary + ": " + stringify(to));

						return to;
					};
				}
			} else {
				throw new Error("Kind name not recognized.");
			}
		} else if (direction === "local2remote") {
			if (kindName === Kinds.objects.calendarevent.name) {
				return function (to, from) {
					if (self._isEventFromReadOnlyCalendar(from)) {
						// Filter out events from read-only calendars
						log("\n--->>> Tried to transform an event from a read-only calendar: " + stringify(from));
						return;
					}

					// If this is a new event, it will have no UID, so we
					// generate one now
					log("\n-->> Transforming " + from.subject + " (" + direction + ")");
					log("\n-->> To: " + stringify(to));
					log("\n-->> From: " + stringify(from));

					from.uid = from.uid || Utils.createUID(from._id);
					to.UID = from.uid;
					to.etag = from.etag;

					log("\n-->> Transformed " + from.subject + ": " + stringify(to));

					return to;
				};
			}
		}
	},

	/*
	 * Returns the unique identifier for that object.  This is used to track syncing of the local and remote
	 * copies.
	 */
	getRemoteId: function(obj, kindName)
	{
		//brauch ich nicht...???
		log("SyncAssistant::getRemoteId.");
		log("obj = " + JSON.stringify(obj));
		log("kindName = " + JSON.stringify(kindName));
		// throw new Error("No getRemoteId function");
		if (kindName === Kinds.objects.calendarevent.name) {
			return obj.item.href;
		} else if (kindName === Kinds.objects.calendar.name) {
			return obj.UID;
		}
	},

	/*
	 * Returns true if the objects has been deleted from the server (ie. this is a tombstone).
	 */
	isDeleted: function(obj, kindName)
	{
		log("SyncAssistant::isDeleted.");
		log("obj = " + JSON.stringify(obj));
		log("kindName = " + JSON.stringify(kindName));
		// throw new Error("No isDeleted function");
		if (kindName === Kinds.objects.calendarevent.name) {
			log(">>> isDeleted(): " + stringify(obj));
			return obj.isDeleted;
		}
	},

	/*
	 * Returns a set of remote changes from the server.
	 */
	getRemoteChanges: function(state, kindName)
	{
		log("SyncAssistant::isDeleted.");
		log("state = " + JSON.stringify(state));
		log("kindName = " + JSON.stringify(kindName));
		if (kindName === Kinds.objects.calendar.name) {
			return this._getRemoteCalendarChanges(state);
		} else if (kindName === Kinds.objects.calendarevent.name) {
			return this._getRemoteCalendarEventChanges(state);
		} else {
			throw new Error("Kind name not recognized");
		}
	},

	/*
	 * Given a set of remote ids, returns a set of remote objects matching those ids.
	 */
	getRemoteMatches: function(remoteIds, kindName)
	{
		log("SyncAssistant::isDeleted.");
		log("remoteIds = " + JSON.stringify(remoteIds));
		log("kindName = " + JSON.stringify(kindName));
		if (kindName === Kinds.objects.calendar.name) {
			return this._getRemoteCalendarMatches(remoteIds);
		} else if (kindName === Kinds.objects.calendarevent.name) {
			return this._getRemoteCalendarEventMatches(remoteIds);
		} else {
			throw new Error("Kind name not recognized");
		}
	},

	/*
	 * Put a set of remote objects to the server.  Each object has an operation property
	 * which is either 'save' or 'delete', depending on how the objects should be put
	 * onto the server.
	 */
	putRemoteObjects: function(objects, kindName)
	{
		log("SyncAssistant::isDeleted.");
		log("objects = " + JSON.stringify(objects));
		log("kindName = " + JSON.stringify(kindName));
		Utils.log("\n-->> putRemoteObjects(" + kindName + ")");
		if (kindName === Kinds.objects.calendarevent.name) {
			return this._putRemoteCalendarEventObjects(objects);
		} else {
			throw new Error("putRemoteObjects() not supported for kind '" + kindName + "'");
		}
	},

	/*
	 * Create an 'empty' remote objects which can then have the local content
	 * transformed into.
	 */
	getNewRemoteObject: function(kindName)
	{
		log("SyncAssistant::getSyncOrder.");
		log("kindName = " + JSON.stringify(kindName));
		if (kindName === Kinds.objects.calendarevent.name) {
			return {
				UID: undefined,
				etag: undefined,
				vCal: undefined
			};
		} else {
			throw new Error("getNewRemoteObject() not supported for kind '" + kindName + "'");
		}
	},

	postPutRemoteModify: function(objects, kindName) {
		log("SyncAssistant::getSyncOrder.");
		log("objects = " + JSON.stringify(objects));
		log("kindName = " + JSON.stringify(kindName));
		if (kindName === Kinds.objects.calendarevent.name) {
			return this._postPutRemoteModifyCalendarEvents(objects);
		} else {
			throw new Error("putRemoteObjects() not supported for kind '" + kindName + "'");
		}
	},

	/*
	 * Return an array of "identifiers" to identify object types for synchronization
	 * and what order to sync them in
	 * This will normally be an array of strings, relating to the getSyncObjects function:
	 * [ "contactset", "contact" ]
	 */
	getSyncOrder: function() {
		log("SyncAssistant::getSyncOrder.");
		log("Kinds = " + JSON.stringify(Kinds));
		return Kinds.syncOrder;
	},

	/*
	 * Return an array of "kind objects" to identify object types for synchronization
	 * This will normally be an object with property names as returned from getSyncOrder, with structure like this:
	 * {
	 *   contact: {
	 *     id: com.palm.contact.google:1
	 *     metadata_id: com.palm.contact.google.transport:1
	 *   }
	 * }
	 */
	getSyncObjects: function() {
		log("SyncAssistant::getSyncObjects.");
		log("Kinds = " + JSON.stringify(Kinds));
		return Kinds.objects;
	},

	/*
	 * Return the ID string for the capability (e.g., CALENDAR, CONTACTS, etc.)
	 * supported by the sync engine as specified in the account template (e.g.,
	 * com.palm.calendar.google, com.palm.contacts.google, etc.).
	 */
	getCapabilityProviderId: function() {
		log("SyncAssistant::getCapabilityProviderId.");
		log("Config = " + JSON.stringify(Config));
		return Config.capabilityProviderId;
	}
});
