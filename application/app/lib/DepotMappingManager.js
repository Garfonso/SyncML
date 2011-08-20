DepotMappingManager = Class.create({
		initialize: function(dbname) {
			this.db = new Mojo.Depot({name: 'fnbl'+dbname});
		},
		getMappings: function(successCallback, failureCallback) {
			return this.db.get('mapping', successCallback, failureCallback);
		},
		saveMappings: function(data,successCallback, failureCallback) {
			this.db.add('mapping',data,successCallback,failureCallback);
		},
		removeMappings: function(successCallback, failureCallback) {
			this.db.removeAll(successCallback, failureCallback);
		}
		
});

