// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

// Implements the 4K unbanked format. Smaller ROMs will be copied multiple times to fill the entire 4K

jt.Cartridge4K = function(rom, format) {
"use strict";

    function init(self) {
        self.rom = rom;
        self.format = format;
        // Always use a 4K ROM image, multiplying the ROM internally
        bytes = new Array(4096);
        self.bytes = bytes;
        var len = rom.content.length;
        for (var pos = 0; pos < bytes.length; pos += len)
            jt.Util.arrayCopy(rom.content, 0, bytes, pos, len);
 
        hasPlusFunctions = jt.CartridgePlusFunctions.checkROM(rom);
        if(hasPlusFunctions){
          out_buffer_write_pointer = 0;
          out_buffer_send_pointer = 0;
          receive_buffer_write_pointer = 0;
          receive_buffer_read_pointer = 0;
          plusStoreID = localStorage.getItem("plusStoreID"); 
          if(plusStoreID == null){
              var username = window.prompt("This ROM apparently uses PlusROM functions. Please insert your nickname for the back end requests (max. 10 chars)." );
              plusStoreID = username.trim().substr(0, 10) + " WExxxxxxxxxxxxxxxxxxxxxx".replace(/[x]/g, function(c) { return Math.floor(Math.random() * 10).toString(); });
              localStorage.setItem("plusStoreID", plusStoreID);
          }
          
          var pointerNMI = bytes.length - 5;
          var i = ((bytes[pointerNMI--] - 16) * 256 ) + bytes[pointerNMI];
          path = "";
          host = "";
          
          while (jt.CartridgePlusFunctions.isValidPathChar(bytes[i])){
              path +=  String.fromCharCode(bytes[i++]);
          }
          i++;
          while (jt.CartridgePlusFunctions.isValidHostChar(bytes[i])){
              host +=  String.fromCharCode(bytes[i++]);
          }
          url = location.protocol + "//" + host + "/" + path;
        }

    }

    this.read = function(address) {
        var maskedAddress = address & ADDRESS_MASK;
        if(hasPlusFunctions){
            if (maskedAddress == 0x0ff2){				   // Receive buffer
                var last_pos = receive_buffer_read_pointer;
                if(receive_buffer_read_pointer != receive_buffer_write_pointer){
                   if( ++receive_buffer_read_pointer > 255)
                        receive_buffer_read_pointer = 0;
                }
                return receive_buffer[last_pos];
            }else if (maskedAddress == 0x0ff3){		// Receive buffer length should always be >= 0
                if(receive_buffer_read_pointer > receive_buffer_write_pointer ){
                    return receive_buffer_write_pointer - receive_buffer_read_pointer + 255;
                }else{
                    return receive_buffer_write_pointer - receive_buffer_read_pointer;
                }
            }
        }
        return bytes[maskedAddress];
    };

    this.write = function(address, val) {
        var maskedAddress = address & ADDRESS_MASK;
        if(hasPlusFunctions){
            if (maskedAddress == 0x0ff0 ){
                out_buffer[out_buffer_write_pointer++] = val;
                if (out_buffer_write_pointer > 255)
                    out_buffer_write_pointer = 0;
            }else if (maskedAddress == 0x0ff1 ){
                out_buffer[out_buffer_write_pointer++] = val;
    
                var req = new XMLHttpRequest();
                req.open("POST", url, true);
                req.setRequestHeader("PlusStore-ID", plusStoreID);
                req.setRequestHeader("Content-Type", "application/octet-stream");
                
                req.responseType = "arraybuffer";
                req.timeout = DEFAULT_TIMEOUT;
                req.onload = function () {
                    if (req.status === 200){
                      var raw_response = new Uint8Array(req.response);
                      var length  = raw_response[0];
                      var src_pos = 1;
                      while(!(src_pos > length)){
                        receive_buffer[receive_buffer_write_pointer++] = raw_response[src_pos++];
                        if(receive_buffer_write_pointer > 255)
                          receive_buffer_write_pointer = 0;
                      }
                    }else{
                      req.onerror();
                    }
                };
                req.onerror = req.ontimeout = function () {
                    console.log(" error 1 :" + req.status + " " + req.statusText);
                };
                
                var sendBinaryArray = new ArrayBuffer(out_buffer_write_pointer);
                var longInt8View = new Uint8Array(sendBinaryArray);
               
                for (var i = 0; out_buffer_write_pointer > i; i++){
                      longInt8View[i] = out_buffer[i];
               }
                req.send(sendBinaryArray);
    
                out_buffer_write_pointer = 0;
            }
        }
    };

    // Savestate  -------------------------------------------

    this.saveState = function() {
        return {
            f: this.format.name,
            r: this.rom.saveState(),
            b: jt.Util.compressInt8BitArrayToStringBase64(bytes),

            rb: jt.Util.compressInt8BitArrayToStringBase64(receive_buffer),
            ob: jt.Util.compressInt8BitArrayToStringBase64(out_buffer),
            h: host,
            p: path,
            pid: plusStoreID,
            u: url
        };
    };

    this.loadState = function(state) {
        this.format = jt.CartridgeFormats[state.f];
        this.rom = jt.ROM.loadState(state.r);
        bytes = jt.Util.uncompressStringBase64ToInt8BitArray(state.b, bytes);
        this.bytes = bytes;

        receive_buffer = jt.Util.uncompressStringBase64ToInt8BitArray(state.rb, receive_buffer);
        out_buffer = jt.Util.uncompressStringBase64ToInt8BitArray(state.ob, out_buffer);
        plusStoreID = state.pid;
        url = state.u;
    };


    var bytes;

    var hasPlusFunctions = false;
    var plusStoreID;
    var out_buffer_write_pointer, out_buffer_send_pointer;
    var out_buffer = jt.Util.arrayFill(new Array(256), 0);
    var receive_buffer_write_pointer, receive_buffer_read_pointer;
    var receive_buffer = jt.Util.arrayFill(new Array(256), 0);
    var host, path, url;
    var DEFAULT_TIMEOUT = 15000;

    var ADDRESS_MASK = 0x0fff;


    if (rom) init(this);

};

jt.Cartridge4K.prototype = jt.Cartridge.base;

jt.Cartridge4K.recreateFromSaveState = function(state, prevCart) {
    var cart = prevCart || new jt.Cartridge4K();
    cart.loadState(state);
    return cart;
};
