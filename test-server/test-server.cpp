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
    bool logged_in = false;
    std::string name = "not logged-in";
    Response pong;

    Client(): endpoint(new WS_Endpoint(acceptor))
    {
        endpoint->options.inactive_warning = 10;
        endpoint->options.read_timeout = 15;
        endpoint->connect();
    }

    void tick()
    {
        if (pong.update(endpoint->responses))
        {
            std::cout << name << ": pong received" << std::endl;
            pong.dismiss();
        }
    }

    void reset()
    {
        name = "not logged-in";
        logged_in = false;
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
    JSObject out;

    if (msg.data.get("name","").size() > 20)
    {
        out.put("info","maximal 20 zeichen");
        out.put("result",false);
    }
    else if (!client->logged_in)
    {
        client->name = msg.data.get("name","");
        if (client->name.empty())
        {
            out.put("info","no name found");
            out.put("result",false);
        }
        else
        {
            out.put("info","name accepted");
            out.put("result",true);
            client->logged_in = true;
        }
    }
    else
    {
        out.put("info","you already have a name");
        out.put("result",true);
    }
    client->endpoint->respond(msg.id, out);
}

void on_client_message(Client* client, const Message& msg)
{
    if (!client->logged_in)
    {
        std::cout << "Nachricht abgelehnt" << std::endl;
        return;
    }
    std::string text = msg.data.get("text","");
    std::cout << client->name << ": " << text << std::endl;
    if (text.empty())
        return;
    JSObject packet;
    packet.put("text",text);
    packet.put("time",time(nullptr));
    packet.put("sender",client->name);
    for (Client& other: clients)
    {
        if (!other.endpoint->is_connected())
            continue;
        other.endpoint->notify("message", packet);
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
            if (ev.type == EventType::message)
            {
                if (ev.msg.name == "login")
                    on_client_login(&client,ev.msg);
                else if (ev.msg.name == "message")
                    on_client_message(&client,ev.msg);
                else
                    std::cout << "unbekannte anfrage: " << ev.msg.name << std::endl;
            }
            if (ev.type == EventType::inactive)
            {
                std::cout << client.name << ": inactive" << std::endl;
                if (!client.pong.is_requested())
                    client.pong = client.endpoint->request("ping");
            }
        }
        client.tick();
    }
}