SyncMLStatus = Class.create({
		initialize: function(cmdId, msgref, cmdref, cmd, src, tgt, status) {
			this.cmdId = cmdId;
			this.msgref = msgref;
			this.cmdref = cmdref;
			this.cmd = cmd;
			this.tgt = tgt;
			this.src = src;
			this.status = status;
		}
});

