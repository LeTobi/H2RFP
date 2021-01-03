#include <tobilib/protocols/h2rfp.h>
#include <iostream>
#include <vector>

using namespace tobilib;
using namespace h2rfp;

const unsigned int CLIENT_MAX = 100;

network::Acceptor acceptor (15432);

class Client
{
public:
    WS_Endpoint* endpoint;
    std::string name;

    Client(): endpoint(new WS_Endpoint(acceptor))
    {
        endpoint->connect();
    }

    void reset()
    {
        name = "";
    }
};

std::vector<Client> clients (CLIENT_MAX);

void on_client_connect(Client* c)
{
    std::cout << "neuer client: " << c->endpoint->remote_ip().to_string() << std::endl;
}

void on_client_close(Client* c)
{
    std::cout << "client getrennt: " << c->endpoint->remote_ip().to_string() << std::endl;
    c->reset();
    c->endpoint->connect();
}

void on_client_login(Client* client, const Message& msg)
{
    Message out;
    out.id = msg.id;

    if (msg.data.get("name","").size() > 20)
    {
        out.data.put("info","maximal 20 zeichen");
        out.data.put("result",false);
    }
    else if (client->name.empty())
    {
        client->name = msg.data.get("name","");
        if (client->name.empty())
        {
            out.data.put("info","no name found");
            out.data.put("result",false);
        }
        else
        {
            out.data.put("info","name accepted");
            out.data.put("result",true);
        }
    }
    else
    {
        out.data.put("info","you already have a name");
        out.data.put("result",true);
    }
    client->endpoint->send(out);
}

void on_client_message(Client* client,const Message& msg)
{
    if (client->name.empty())
        return;
    std::string text = msg.data.get("text","");
    if (text.empty())
        return;
    Message packet;
    packet.name = "message";
    packet.data.put("text",text);
    packet.data.put("time",time(nullptr));
    packet.data.put("sender",client->name);
    for (Client& other: clients)
    {
        if (!other.endpoint->is_connected())
            continue;
        other.endpoint->send(packet);
    }
}

int main()
{
    std::cout << "chatserver auf port 15432" << std::endl;
    
    while (true)
    for (Client& client: clients)
    {
        client.endpoint->tick();
        while (!client.endpoint->events.empty())
        {
            EndpointEvent ev = client.endpoint->events.next();
            if (ev.type == EventType::connected)
                on_client_connect(&client);
            if (ev.type == EventType::closed)
                on_client_close(&client);
            if (ev.type == EventType::request)
            {
                if (ev.msg.name == "login")
                    on_client_login(&client,ev.msg);
                else if (ev.msg.name == "message")
                    on_client_message(&client,ev.msg);
                else
                    std::cout << "unbekannte anfrage: " << ev.msg.name << std::endl;
            }
        }
    }
}