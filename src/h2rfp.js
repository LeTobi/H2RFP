class H2RFP_Parser
{
    constructor()
    {
        this.output = [];

        this.state = H2RFP_ParserState_START;
        this.current = {name:"",id:0,data:{}};
        this.datalen = 0;
        this.buffer = "";
    }

    feed(streamdata) {
        for (var i=0;i<streamdata.length;i++)
        switch(this.state)
        {
        case H2RFP_ParserState_ERROR:
            return;

        case H2RFP_ParserState_START:
            if (streamdata[i] != "!")
            {
                console.log("Es wird '!' am Anfang einer Anfrage erwartet.");
                this.state = H2RFP_ParserState_ERROR;
                return;
            }
            this.state = H2RFP_ParserState_NAME
            break;

        case H2RFP_ParserState_NAME:
            if (streamdata[i] == ";")
                this.state = H2RFP_ParserState_ID;
            else
                this.current.name += streamdata[i];
            break;

        case H2RFP_ParserState_ID:
            if (streamdata[i] == ";")
            {
                this.current.id = Number(this.buffer);
                if (this.current.id==NaN || this.current.id<0)
                {
                    console.log("Es wird eine positive ID erwartet");
                    this.state = H2RFP_ParserState_ERROR;
                    return;
                }
                this.buffer = "";
                this.state = H2RFP_ParserState_SIZE;
            }
            else
            {
                this.buffer += streamdata[i];
            }
            break;

        case H2RFP_ParserState_SIZE:
            if (streamdata[i] == ";")
            {
                this.datalen = Number(this.buffer);
                if (this.datalen==NaN || this.datalen<0)
                {
                    console.log("Es wurde eine Datenlänge erwartet");
                    this.state = H2RFP_ParserState_ERROR;
                    return;
                }
                this.buffer="";
                this.state = H2RFP_ParserState_DATA;

                if (this.datalen == 0)
                {
                    this.output.push(this.current);
                    this.current = {name:"",id:0,data:{}};
                    this.state = H2RFP_ParserState_START;
                }
            }
            else
            {
                this.buffer += streamdata[i];
            }
            break;

        case H2RFP_ParserState_DATA:
            this.buffer += streamdata[i];
            if (this.buffer.length == this.datalen)
            {
                try {
                    this.current.data = JSON.parse(this.buffer);
                } catch (e) {
                    console.log(e);
                    this.state = H2RFP_ParserState_ERROR;
                    return;
                }
                this.buffer = "";
                this.output.push(this.current);
                this.current = {name:"",id:0,data:{}};
                this.state = H2RFP_ParserState_START;
            }
            break;
        }
    }

    is_good()
    {
        return this.state != H2RFP_ParserState_ERROR;
    }

    reset()
    {
        this.output = [];
        this.state = H2RFP_ParserState_START;
        this.current = {name:"",id:0,data:{}};
        this.datalen = 0;
        this.buffer = "";
    }

    static stringify(message)
    {
        var output = "!";
        output += message.name;
        output += ";";
        output += message.id;
        output += ";";
        
        if (message.data==undefined)
            message.data = { };
        
        var datastr = JSON.stringify(message.data);
        output += datastr.length;
        output += ";";
        output += datastr;
        return output;
    }
}

H2RFP_ParserState_ERROR = 0;
H2RFP_ParserState_START = 1;
H2RFP_ParserState_NAME  = 2;
H2RFP_ParserState_ID    = 3;
H2RFP_ParserState_SIZE  = 4;
H2RFP_ParserState_DATA  = 5;

H2RFP_SocketState_CLOSED  = 0;
H2RFP_SocketState_OPENING = 1;
H2RFP_SocketState_OPEN    = 2;
H2RFP_SocketState_CLOSING = 3;

class H2RFP_Socket
{
    constructor(address, port)
    {
        if (address==undefined || port==undefined)
            throw "address and port must be defined";

        // private params
        this.address = address;
        this.port = port;
        this.listeners = [];
        this.openPromise = undefined;
        this.closePromise = undefined;
        this.requestPromises = [];
        this.parser_nexti = 1;
        this.writebuffer = "";

        // private state
        this.socket = undefined;
        this.parser = new H2RFP_Parser();
        
        // private target
        this.target = H2RFP_SocketState_CLOSED;

        // public state
        this.state = H2RFP_SocketState_CLOSED;

        // public access
        this.onConnect = ()=>{};
        this.onDisconnect = ()=>{};
    }

    private_servemessage(msg)
    {
        if (msg.name.length==0)
        {
            for (var i=0;i<this.requestPromises.length;i++)
            {
                if (this.requestPromises[i][0] == msg.id)
                {
                    this.requestPromises[i][1].resolve(msg.data);
                    this.requestPromises.splice(i,1);
                    return;
                }
            }
            console.log("unknown server reaction: id "+msg.id);
            return;
        }
        else
        {
            var response_cb = this.private_respond.bind(this,msg.id);
            for (var i=0;i<this.listeners.length;i++)
            {
                if (this.listeners[i][0] == msg.name)
                {
                    this.listeners[i][1].call(null,msg.data,response_cb);
                    return;
                }
            }
            console.log("unknwon server event: "+msg.name);
            return;
        }
    }

    private_react()
    {
        if (this.target == H2RFP_SocketState_OPEN)
        {
            if (this.state==H2RFP_SocketState_CLOSED && this.parser.state == H2RFP_ParserState_ERROR)
            {
                this.parser.reset();
                // continue with react()!
            }
            if (this.state==H2RFP_SocketState_OPENING && this.parser.state == H2RFP_ParserState_ERROR)
            {
                throw "Dieser Status sollte nicht existieren!";
            }
            if (this.state==H2RFP_SocketState_OPEN && this.parser.state == H2RFP_ParserState_ERROR)
            {
                this.state = H2RFP_SocketState_CLOSING;
                this.socket.close();
                this.parser.reset();
            }
            if (this.state==H2RFP_SocketState_CLOSING && this.parser.state == H2RFP_ParserState_ERROR)
            {
                this.parser.reset();
            }
            if (this.state==H2RFP_SocketState_CLOSED && this.parser.state != H2RFP_ParserState_ERROR)
            {
                this.socket = new WebSocket("ws://" + this.address + ":" + this.port);
                this.socket.onopen = this.private_onopen.bind(this);
                this.socket.onmessage = this.private_onmessage.bind(this);
                this.socket.onclose = this.private_onclose.bind(this);
                this.socket.onerror = this.private_onerror.bind(this);
                this.state = H2RFP_SocketState_OPENING;
            }
            if (this.state==H2RFP_SocketState_OPENING && this.parser.state != H2RFP_ParserState_ERROR)
            {
                // just waiting
            }
            if (this.state==H2RFP_SocketState_OPEN && this.parser.state != H2RFP_ParserState_ERROR)
            {
                if (this.openPromise!=undefined)
                    this.openPromise.resolve();
                this.openPromise = undefined;
                if (this.writebuffer.length>0)
                    this.socket.send(this.writebuffer);
                this.writebuffer = "";
            }
            if (this.state==H2RFP_SocketState_CLOSING && this.parser.state != H2RFP_ParserState_ERROR)
            {
                // just waiting
            }
        }
        else if (this.target == H2RFP_SocketState_CLOSED)
        {
            if (this.state==H2RFP_SocketState_CLOSED && this.parser.state == H2RFP_ParserState_ERROR)
            {
                this.parser.reset();
            }
            if (this.state==H2RFP_SocketState_OPENING && this.parser.state == H2RFP_ParserState_ERROR)
            {
                throw "Dieser Status sollte nicht existieren!"
            }
            if (this.state==H2RFP_SocketState_OPEN && this.parser.state == H2RFP_ParserState_ERROR)
            {
                this.parser.reset();
                this.state = H2RFP_SocketState_CLOSING;
                this.socket.close();
            }
            if (this.state==H2RFP_SocketState_CLOSING && this.parser.state == H2RFP_ParserState_ERROR)
            {
                this.parser.reset();
            }
            if (this.state==H2RFP_SocketState_CLOSED && this.parser.state != H2RFP_ParserState_ERROR)
            {
                if (this.openPromise!=undefined)
                    this.openPromise.reject("connection failed");
                this.openPromise = undefined;
                if (this.closePromise!=undefined)
                    this.closePromise.resolve();
                this.closePromise = undefined;
                this.requestPromises.forEach((e,i,a)=>{e[1].reject("connection failed")});
                this.requestPromises = [];
            }
            if (this.state==H2RFP_SocketState_OPENING && this.parser.state != H2RFP_ParserState_ERROR)
            {
                // just waiting
            }
            if (this.state==H2RFP_SocketState_OPEN && this.parser.state != H2RFP_ParserState_ERROR)
            {
                this.state = H2RFP_SocketState_CLOSING;
                this.socket.close();
            }
            if (this.state==H2RFP_SocketState_CLOSING && this.parser.state != H2RFP_ParserState_ERROR)
            {
                // just waiting
            }
        }
        else
        {
            throw "Ungültiger Zielstatus";
        }
    }

    private_onopen()
    {
        this.state = H2RFP_SocketState_OPEN;
        this.private_react();
        this.onConnect.call();
    }

    private_onmessage(message)
    {
        this.parser.feed(message.data);
        if (this.parser.state != H2RFP_ParserState_ERROR)
        {
            this.parser.output.forEach(((e,i,a)=>{
                this.private_servemessage(e);
            }).bind(this));
            this.parser.output = [];
        }
        this.private_react();
    }

    private_onclose()
    {
        this.target = H2RFP_SocketState_CLOSED; // do not retry
        this.state = H2RFP_SocketState_CLOSED;
        this.private_react();
        this.onDisconnect.call();
    }

    private_onerror()
    {
        // parallel to onclose
    }

    private_write_serial(data)
    {
        if (this.state == H2RFP_SocketState_OPEN)
            this.socket.send(data);
        else
            this.writebuffer += data;
    }

    private_respond(evid, evData)
    {
        var serial = H2RFP_Parser.stringify({name:"",id:evid,data:evData});
        this.private_write_serial(serial);
    }

    open()
    {
        this.target = H2RFP_SocketState_OPEN;
        var out = new Promise(((res,rej)=>{
            this.openPromise={resolve:res,reject:rej}
        }).bind(this));
        this.private_react();
        return out;
    }

    close()
    {
        this.target = H2RFP_SocketState_CLOSED;
        var out = new Promise(((res,rej)=>{
            this.closePromise={resolve:res,reject:rej}
        }).bind(this));
        this.private_react();
        return out;
    }

    listen(evName,callback)
    {
        this.listeners.push([evName,callback]);
    }

    notify(evName, evData)
    {
        var serial = H2RFP_Parser.stringify({name:evName,id:0,data:evData});
        this.private_write_serial(serial);
    }

    exec(evName, evData)
    {
        var serial = H2RFP_Parser.stringify({name:evName,id:this.parser_nexti,data:evData});
        this.private_write_serial(serial);
        var out = new Promise(((res,rej)=>{
            this.requestPromises.push([this.parser_nexti,{resolve:res,reject:rej}]);
        }).bind(this));
        this.parser_nexti = ((++this.parser_nexti)%9999)+1;
        return out;
    }
}