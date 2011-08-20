function DeviceConfig(devID) {
	this.verDTD = "1.2";
	this.man = null;
	this.mod = null;
	this.oem = null;
	this.fwv = null;
	this.swv = null;
	this.hwv = null;
	this.devID = devID;
	this.devType = "phone";
	this.dsV = "1.2";
	this.utc = true;
	this.loSupport = true;
	this.nocSupport = false;
	this.maxMsgSize = 16*1024;
	this.maxObjSize = 16*1024;
}
