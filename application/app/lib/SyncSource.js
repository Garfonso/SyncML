/* Based off SyncSource and BaseSyncSource in JME */
SyncSource = Class.create({
		initialize: function(config) {
			this.config = config;
			
			this.name = config.name;
			this.remoteUri = config.remoteUri;
			this.type = config.type;
			this.encoding = config.encoding;
			this.syncMode = config.syncMode;
			
			
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
		},
		
		updateItem: function(item) {
		},
		
		deleteItem: function(item) {
		},
		
		nextItem: function() {
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
		},
		
		endSync: function() {
		},
		
		createSyncItem: function(key, type, state, parent, size) {
		},
		
		initAllItems: function() {
		},
		
		initNewItems: function() {
		},
		
		initUpdItems: function() {
		},
		
		initDelItems: function() {
		},
		
		getItemContent: function(item) {
		}
});
