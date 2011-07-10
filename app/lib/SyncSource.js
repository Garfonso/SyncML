/* Based off SyncSource and BaseSyncSource in JME */
SyncSource = Class.create({
		initialize: function(config) {
			this.config = config;
			
			this.name = config.name;
			this.remoteUri = config.remoteUri;
			this.type = config.type;
			this.encoding = config.encoding;
			this.syncMode = config.syncMode;
			
			this.logCallBack = Mojo.Log.info;
			
			// Init lists
			this.allItems = null;
			this.newItems = null;
			this.updItems = null;
			this.delItems = null;
			
			this.allIndex = this.newIndex = this.updIndex = this.delIndex = 0;
			
			this.clientItemsNumber = this.serverItemsNumber = -1;
			this.clientAddItemsNumber = -1;
			this.clientReplaceItemsNumber = -1;
			this.clientDeleteItemsNumber = -1;
			
			this.filter = null;
		},
		
		getConfig: function() {
			return this.config;
		},
		
		addItem: function(item) {
			this.logCallBack("Add Item called with item " + JSON.stringify(item));
		},
		
		updateItem: function(item) {
			this.logCallBack("Update Item called with item " + JSON.stringify(item));
		},
		
		deleteItem: function(item) {
			this.logCallBack("Delete Item called with item " + JSON.stringify(item));
		},
		
		nextItem: function() {
			this.logCallBack("nextItemCalled!");
			if (this.allItems === null) {
			}
			if (this.allIndex<this.allItems.length) {
				var ret = this.getItemContent(this.allItems[this.allIndex]);
				this.allIndex++;
				return ret;
			} else {
				this.allItems = null;
				this.allIndex = 0;
				return null;
			}
		},
		
		nextNewItem: function() {
			this.logCallBack("nextNewCalled!");
			if (this.newItems === null) {
			}
			if (this.newIndex < this.newItems.length) {
				var ret = this.getItemContent(this.newItems[this.newIndex]);
				this.newIndex++;
				return ret;
			} else {
				this.newItems = null;
				this.newIndex = 0;
				return null;
			}
		},
		
		nextUpdatedItem: function() {
			this.logCallBack("nextUpdatedCalled!");
			if (this.updItems === null) {
			}
			if (this.updIndex < this.updItems.length) {
				var ret = this.getItemContent(this.updItems[this.updIndex]);
				this.updIndex++;
				return ret;
			} else {
				this.updItems = null;
				this.updIndex = 0;
				return null;
			}
		},
		
		nextDeletedItem: function() {
			this.logCallBack("nextDeletedCalled!");
			if (this.delItems === null) {
			}
			if (this.delIndex < this.delItems.length) {
				var ret = this.getItemContent(this.delItems[this.delIndex]);
				this.delIndex++;
				return ret;
			} else {
				this.delItems = null;
				this.delIndex = 0;
				return null;
			}
		},
		
		setItemStatus: function(key, status) {
			this.logCallBack("setItemStatus called with " + JSON.stringify(key) + " - " + JSON.stringify(status));
		},
		
		getLastAnchor: function() {
			return this.config.lastAnchor;
		},
		
		setLastAnchor: function(time) {
			this.config.lastAnchor = time;
		},
		
		getNextAnchor: function() {
			return this.config.nextAnchor;
		},
		
		setNextAnchor: function(time) {
			this.config.nextAnchor = time;
		},
		
		beginSync: function(syncMode) {
			this.logCallBack("BeginSync called with " + JSON.stringify(syncMode));
		},
		
		endSync: function() {
			this.logCallBack("endSyncCalled");
		},
		
		createSyncItem: function(key, type, state, parent, size) {
			this.logCallBack("createSyncItem called with key=" + JSON.stringify(key) + ",type=" + JSON.stringify(type));
			this.logCallBack(",state="+JSON.stringify(state)+",parent="+JSON.stringify(parent)+",size="+JSON.stringify(size));
		},
		
		initAllItems: function() {
			this.logCallBack("initAllItemsCalled");
		},
		
		initNewItems: function() {
			this.logCallBack("initNewItemsCalled");
		},
		
		initUpdItems: function() {
			this.logCallBack("initUpdItemsCalled");
		},
		
		initDelItems: function() {
			this.logCallBack("initDelItemsCalled");
		},
		
		getItemContent: function(item) {
			this.logCallBack("getItemsContent Called " + JSON.stringify(item));
		}
});
